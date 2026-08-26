import os
import sys
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import pandas as pd
import numpy as np


# ==========================================
# 1. 폴더 절대 경로 설정
# ==========================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
CORS(app)


# ── LLM 파이프라인 연결 ────────────────────
# 추천 엔진은 형제 폴더에 있다.
#   Life_Fit/
#   ├── life-fit-embed/    ← 두뇌
#   └── lifefit-web/      ← 여기
EMBED_DIR = os.path.join(BASE_DIR, '..', 'life-fit-embed')
sys.path.insert(0, os.path.abspath(EMBED_DIR))

from app.features.pipeline_api import search, recommend_by_weights
print("✅ LLM 파이프라인 연결 성공!")


# ==========================================
# 2. 데이터셋 로드 (data/ 폴더 내부 참조)
# ==========================================

LH_CSV_PATH = os.path.join(DATA_DIR, "0. 한국토지주택공사 주택 평면도 현황 목록 (20210915) PART-2.csv")
try:
    df_lh = pd.read_csv(LH_CSV_PATH, encoding='cp949')
    print(f"✅ LH 평면도 데이터 로드 완료! (총 {len(df_lh)}개 행)")
except Exception as e:
    print("❌ LH 평면도 데이터 로드 실패:", e)
    df_lh = pd.DataFrame()


COORD_CSV_PATH = os.path.join(DATA_DIR, '동_좌표.csv')
try:
    coord_df = pd.read_csv(COORD_CSV_PATH)
    # (구, 행정동명) > (위도, 경도) 로 바로 찾을 수 있게 만들어둔다
    COORDS = {
        (str(r['구']).strip(), str(r['행정동명']).strip()): (float(r['위도']), float(r['경도']))
        for _, r in coord_df.iterrows()
    }
    print(f"✅ 동_좌표.csv 로드 완료! (총 {len(COORDS)}개 동)")
except Exception as e:
    print("❌ 동 좌표 로드 실패:", e)
    COORDS = {}

# ==========================================
# 3. 헬퍼 함수 정의
# ==========================================
# 프론트는 영문 키, LifeFitDB 는 한국어 지표명을 쓴다.
# 경계에서 한 번만 변환한다
KEY_MAP = {
    'greenery': '녹지',
    'safety': '안전',
    'transport': '교통',
    'commercial': '상권',
    'medical': '의료',
    'education': '교육',
    'culture': '문화',
}


def build_floorplan_path(row):
    """CSV 한 줄에서 이미지 경로를 조립한다."""
    hq = str(row['지역본부명']).strip()
    project = str(row['사업지구명']).strip()
    block = str(row['블록명']).strip()

    if pd.isna(row['블록명']) or block in ('nan', '-'):
        folder_name = f"{hq}_{project}"
    else:
        folder_name = f"{hq}_{project}_{block}"

    csv_filename = str(row['평면도파일명']).strip()
    if folder_name not in csv_filename:
        csv_filename = f"{folder_name}_{csv_filename}"

    return f"LH평면도/{folder_name}/{csv_filename}"


def find_floorplan(area):
    """면적에 가장 가까우면서 이미지가 실제로 있는 평면도 경로를 찾는다.

    CSV 227행 중 폴더가 있는 건 66개뿐이라 존재 확인이 필요하다
    """    
    if df_lh.empty:
        return ""
    
    candidates = df_lh.copy()
    candidates['면적오차'] = (candidates['주거전용면적'] - area).abs()

    for _, row in candidates.sort_values('면적오차').iterrows():
        path = build_floorplan_path(row)
        if os.path.exists(os.path.join(DATA_DIR, path)):
            return path
    return ""


def to_korean_weights(user_prefs):
    """프론트의 영문 슬라이더 값을 한국어 가중치 딕셔너리로 바꾼다."""
    weights = {}
    for eng, kor in KEY_MAP.items():
        try:
            weights[kor] = float(user_prefs.get(eng, 3))
        except (ValueError,TypeError):
            weights[kor] = 3.0
    return weights

def lookup_coords(gu, dong):
    """행정동 이름으로 위경도를 찾는다. 없으면 (None, None)."""
    return COORDS.get((gu.strip(),dong.strip()), (None, None))

    
# ==========================================
# 4. 프론트엔드 정적 서빙 라우트
# ==========================================
@app.route('/')
@app.route('/index.html')
def serve_index():
    return send_from_directory(FRONTEND_DIR, 'index.html')


@app.route('/LH평면도/<path:filename>')
def serve_floorplan(filename):
    """평면도 이미지는 data/LH평면도 에 있다.

    Flask 의 static_folder 는 frontend/ 를 가리키고 있어서
    data/ 안의 파일은 따로 길을 열어 줘야 한다
    """    
    return send_from_directory(os.path.join(DATA_DIR, 'LH평면도'), filename)


@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(FRONTEND_DIR, path)


# ==========================================
# 5. API 라우트: 예측 및 추천 수행
# ==========================================
@app.route('/api/predict', methods=['POST'])
def predict():
    """추천 요청을 처리한다.

    두 가지 입력을 모두 받는다.
      · query 가 있으면   → LLM 이 검색어를 가중치로 바꾼다
      · 없으면            → 슬라이더 값을 그대로 가중치로 쓴다
    어느 쪽이든 recommend 는 같은 모양을 돌려주므로 이후 처리는 하나다.
    """
    try:
        user_prefs = request.json or {}
        
        # 1. 가중치와 추천 지역 구하기
        query = (user_prefs.get('query') or '').strip()
        explanation = ""
        
        if query:
            # 검색어가 오면 LLM 을 태운다
            result = search(query, top_k=5)
            weights = result["weights"]
            regions = result["regions"]
            explanation = result["explanation"]
        else:
            # 슬라이더만 왔으면 가중치를 바로 쓴다
            weights = to_korean_weights(user_prefs)
            regions = recommend_by_weights(weights, top_k=5)

        # 2. 화면에 보낼 모양으로 바꾸기
        # 어느 경로로 왔든 regions 는 같은 모양이므로 여기서 한 번만 변환한다
        top_regions = []
        for idx, r in enumerate(regions):
            gu, dong = r["name"].split(" ", 1)
            lat, lng = lookup_coords(gu, dong)
            
            top_regions.append({
                "rank": idx + 1,
                "name": f"서울특별시 {r['name']}",
                "lat": lat,
                "lng": lng,
                "score": r["total"],
                "scores": r["scores"],
            })
        
        # 3. 폴백 표시
        #    폴백 블록은 없앴지만, 프론트가 이 값을 읽으므로 자리는 남긴다
        used_fallback = False
            
        # 4. 주거 만족도 종합 점수 계산
        area = int(user_prefs.get('area', 59))
        built_year = int(user_prefs.get('builtYear', 2015))
        
        # 가중치 합이 클수록 높은 점수. 한국어 가중치를 그대로 쓴다
        base_score = 40 + sum(weights.values()) * 1.3
        
        if area >= 59:
            base_score += 5
        if built_year >= 2015:
            base_score += 5
        final_score = round(min(98.5, max(30.0, base_score)), 1)
        
        # 5. 면적별 평면도 경로 설정
        #    CSV 227행 중 실제 이미지가 있는 건 66개 폴더뿐이다.
        #    면적이 가까운 순으로 훑다가 파일이 있는 첫 번째를 고른다
        floorplan_path = find_floorplan(area)
                
        return jsonify({
            "score": final_score,
            "topRegions": top_regions,
            "floorplanPath": floorplan_path,
            "fallback": used_fallback,
            "explanation": explanation,     # LLM 설명문 (검색어로 왔을 때만 채워짐)
            "weights": weights,             # 프론트가 슬라이더를 세팅할 수 있게
        })

    except Exception as e:
        print("❌ Predict 에러:", e)
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print("🚀 백엔드 서버 준비 완료! (http://127.0.0.1:5000)")
    app.run(port=5000, debug=True)