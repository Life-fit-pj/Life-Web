"""
행정동 좌표 조회.

지도에 마커를 찍으려면 위경도가 필요한데, 추천 엔진은 동네 이름만 준다.
그래서 여기서 좌표를 붙인다.

pandas 를 쓰지 않고 csv 모듈로 읽는 이유 —
427줄짜리 파일을 읽고 사전 하나 만드는 데 pandas 는 과하다.
"""

import csv
import os

# 이 파일은 services/ 안에 있으므로 두 단계 올라가야 프로젝트 뿌리다
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COORD_PATH = os.path.join(BASE_DIR, 'data', '동_좌표.csv')

# (구, 행정동명) → (위도, 경도)
# 서버가 켜질 때 한 번만 읽어 사전으로 만들어 둔다.
# 요청마다 CSV 를 다시 읽으면 느리다
COORDS = {}

try:
    with open(COORD_PATH, encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            key = (row['구'].strip(), row['행정동명'].strip())
            COORDS[key] = (float(row['위도']), float(row['경도']))
    print(f"✅ 동_좌표.csv 로드 완료! (총 {len(COORDS)}개 동)")
except Exception as e:
    print("❌ 동 좌표 로드 실패:", e)


def lookup_coords(gu, dong):
    """행정동 이름으로 위경도를 찾는다. 없으면 (None, None)."""
    return COORDS.get((gu.strip(), dong.strip()), (None, None))

if __name__ == "__main__":
    print(lookup_coords("노원구", "중계1동"))
    print(lookup_coords("없는구", "없는동"))