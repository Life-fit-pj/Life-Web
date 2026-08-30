import { openReasonModal } from "./reason.js";

let map = null;
let currentMarkers = []; // 지도 위의 마커 및 뱃지를 관리하는 배열
let geocoder = null;    // 카카오 주소-좌표 변환 객체


// 페이지 로드 시 카카오 지도 초기화
document.addEventListener('DOMContentLoaded', () => {
  initKakaoMap();
});

// 1. 카카오 지도 초기화 함수
function initKakaoMap() {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  if (typeof kakao !== 'undefined' && kakao.maps) {
    kakao.maps.load(() => {
      const mapOption = {
        center: new kakao.maps.LatLng(37.5665, 126.9780), // 기본 중심 좌표 (서울시청)
        level: 7 // 지도 확대 레벨
      };

      map = new kakao.maps.Map(mapContainer, mapOption);

      // 카카오 주소->좌표 변환 서비스 객체 생성
      if (kakao.maps.services) {
        geocoder = new kakao.maps.services.Geocoder();
      }

      // 지도 오른쪽 상단 확대/축소 컨트롤러 추가
      const zoomControl = new kakao.maps.ZoomControl();
      map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

      console.log("✅ 카카오 지도 초기화 성공!");
    });
  } else {
    console.error("❌ 카카오 지도 SDK 로드 실패! index.html의 App Key를 확인해 주세요.");
  }
}


// ③ 지도 마커 : 카카오 지도에 TOP 5 마커 및 뱃지 그리기 (지오코딩 이용)
export function renderKakaoMapMarkers(regions, weights) {
  if (!map || !regions || regions.length === 0) return;

  // 기존에 있던 마커 전체 삭제
  currentMarkers.forEach(m => m.setMap(null));
  currentMarkers = [];

  const bounds = new kakao.maps.LatLngBounds();
  let processedCount = 0;

  regions.forEach((item) => {
    // 백엔드에 lat, lng가 이미 올바르게 존재하는 경우 바로 사용
    if (item.lat && item.lng && item.lat > 30) {
      const latLng = new kakao.maps.LatLng(item.lat, item.lng);
      addMarkerAndOverlay(item, latLng, bounds, weights);
      processedCount++;
      if (processedCount === regions.length) map.setBounds(bounds);
    } 
    // 좌표가 없거나 불안정한 경우 카카오 Geocoder로 주소 기반 검색 실행
    else if (geocoder) {
      geocoder.addressSearch(item.name, (result, status) => {
        if (status === kakao.maps.services.Status.OK) {
          const latLng = new kakao.maps.LatLng(result[0].y, result[0].x);
          addMarkerAndOverlay(item, latLng, bounds, weights);
        }
        processedCount++;
        if (processedCount === regions.length) {
          map.setBounds(bounds);
        }
      });
    }
  });
}


// 마커 및 오버레이 뱃지 추가 헬퍼 함수
function addMarkerAndOverlay(item, latLng, bounds, weights) {
  const marker = new kakao.maps.Marker({
    map: map,
    position: latLng,
    title: `${item.rank}위: ${item.name}`
  });

  // 핀을 누르면 추천 사유 패널이 열린다.
  // 오른쪽 목록 클릭은 지도 이동만 하고 패널을 열지 않는다 —
  // 훑어보는 것과 자세히 보려는 것은 다른 의도이기 때문이다
  kakao.maps.event.addListener(marker, "click", () => {
    openReasonModal(item, weights);
  });

  const overlayContent = `
    <div style="
      padding: 5px 12px;
      background: #111827;
      color: #ffffff;
      font-weight: 700;
      font-size: 13px;
      border-radius: 20px;
      border: 2px solid #3b82f6;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      white-space: nowrap;
    ">
      👑 ${item.rank}위 ${item.name}
    </div>
  `;

  const customOverlay = new kakao.maps.CustomOverlay({
    position: latLng,
    content: overlayContent,
    yAnchor: 2.2
  });

  customOverlay.setMap(map);

  currentMarkers.push(marker);
  currentMarkers.push(customOverlay);

  bounds.extend(latLng);
}


/** 목록에서 동네를 고르면 지도를 그 위치로 옮긴다 */
export function panToRegion(item) {
  if (!map) return;

  if (item.lat && item.lng) {
    map.panTo(new kakao.maps.LatLng(item.lat, item.lng));
  } else if (geocoder) {
    geocoder.addressSearch(item.name, (result, status) => {
      if (status === kakao.maps.services.Status.OK) {
        map.panTo(new kakao.maps.LatLng(result[0].y, result[0].x));
      }
    });
  }
}