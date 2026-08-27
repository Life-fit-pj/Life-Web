"""
LH 평면도 선택.

사용자가 입력한 면적에 가장 가까운 평면도를 찾아 준다.

CSV 는 227행이지만 실제 이미지가 있는 폴더는 66개뿐이다.
그래서 "면적이 가장 가까운 것" 을 그냥 고르면 없는 파일을 가리켜 404 가 난다.
가까운 순으로 훑다가 파일이 실제로 있는 첫 번째를 고르는 이유다.
"""

import os

import pandas as pd

# 이 파일은 services/ 안에 있으므로 두 단계 올라가야 프로젝트 뿌리다
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
LH_CSV_PATH = os.path.join(
    DATA_DIR, "0. 한국토지주택공사 주택 평면도 현황 목록 (20210915) PART-2.csv"
)

try:
    df_lh = pd.read_csv(LH_CSV_PATH, encoding='cp949')
    print(f"✅ LH 평면도 데이터 로드 완료! (총 {len(df_lh)}개 행)")
except Exception as e:
    print("❌ LH 평면도 데이터 로드 실패:", e)
    df_lh = pd.DataFrame()


def build_floorplan_path(row):
    """CSV 한 줄에서 이미지 경로를 조립한다.

    폴더 이름은 [지역본부명_사업지구명_블록명] 인데,
    파일 이름에 이미 폴더 이름이 붙어 있는 경우와 아닌 경우가 섞여 있다
    """
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
    """면적에 가장 가까우면서 이미지가 실제로 있는 평면도 경로를 찾는다."""
    if df_lh.empty:
        return ""

    candidates = df_lh.copy()
    candidates['면적오차'] = (candidates['주거전용면적'] - area).abs()

    for _, row in candidates.sort_values('면적오차').iterrows():
        path = build_floorplan_path(row)
        if os.path.exists(os.path.join(DATA_DIR, path)):
            return path
    return ""


if __name__ == "__main__":
    for area in [25, 59, 84, 114]:
        print(f"{area}㎡ → {find_floorplan(area)}")