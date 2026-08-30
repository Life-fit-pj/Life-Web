import { openReasonModal } from "./reason.js";

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