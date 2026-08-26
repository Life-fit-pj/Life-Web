import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS


# ==========================================
# 1. 폴더 절대 경로 설정
# ==========================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
CORS(app)


# ==========================================
# 2. 데이터셋 로드 (data/ 폴더 내부 참조)
# ==========================================

from services.coords import lookup_coords
from services.engine import get_regions, get_facilities
from services.floorplan import find_floorplan

# ==========================================
# 3. 프론트엔드 정적 서빙 라우트
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
# 4. API 라우트: 예측 및 추천 수행
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
        weights, regions, explanation = get_regions(user_prefs)

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
            
        # 3. 예외 상황 시 고정된 순서로 가져오기 (추천이 비었을 때만 풀백)
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

@app.route('/api/region', methods=['POST'])
def region_detail():
    """행정동 하나의 시설 정보를 돌려준다.

    지도 핀을 눌렀을 때 모달이 부른다.
    추천 계산과 무관하므로 /api/predict 와 분리했다 —
    핀을 누를 때마다 427개 동 점수를 다시 계산할 이유가 없다
    """
    try:
        body = request.json or {}
        gu = (body.get('gu') or '').strip()
        dong = (body.get('dong') or '').strip()
        
        if not gu or not dong:
            return jsonify({"error": "gu, dong 이 필요합니다."}), 400
        
        return jsonify({
            "gu": gu,
            "dong": dong,
            **get_facilities(gu, dong, limit=5),
        })
        
    except Exception as e:
        print("❌ Region 에러:", e)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("🚀 백엔드 서버 준비 완료! (http://127.0.0.1:5000)")
    app.run(port=5000, debug=True)