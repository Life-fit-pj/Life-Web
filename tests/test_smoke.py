"""웹 서버 스모크 테스트. 엔진(:8000)은 띄우지 않고 가짜 응답으로 바꿔 끼운다.

실행: py -m pytest tests -q   (저장소 뿌리에서)

보는 것은 "서버가 뜨고, 라우터가 엔진 응답을 화면 형식으로 바꿔 주나" 까지다.
추천 품질은 엔진 저장소가 잰다.
"""

import httpx
import pytest
from fastapi.testclient import TestClient

from main import app
from services import engine, quota

# 엔진이 받은 요청을 기록해 두고 정해 둔 응답을 돌려준다
calls = []
VALID = set()          # 가짜 엔진이 받아 주는 로그인 토큰. 테스트마다 good-token 하나로 시작한다


MEMORY = {"budget_manwon": 30000, "deal_type": "전세", "commute": None, "priorities": ["교육"], "avoid": []}


def fake_engine(request: httpx.Request) -> httpx.Response:
    calls.append((request.method, request.url.path))
    if request.url.path == "/chat":
        return httpx.Response(200, json={"answer": "응암제3동이 나아요", "memory": "예산 3억 · 전세"})
    if request.url.path == "/auth/me":
        if request.headers.get("authorization", "").removeprefix("Bearer ") in VALID:
            return httpx.Response(200, json={"customer_id": "C001", "persona": {}})
        return httpx.Response(401, json={"detail": "토큰이 틀렸다"})
    if request.url.path == "/memory/C001":
        return httpx.Response(200, json={"ok": True} if request.method == "DELETE" else MEMORY)
    if request.url.path == "/recommend":
        return httpx.Response(200, json=[
            {"name": "강남구 대치1동", "total": 91.2, "scores": {}, "counts": {"학원": 120}},
            {"name": "노원구 중계1동", "total": 88.0, "scores": {}, "counts": {"학원": 80}},
        ])
    return httpx.Response(404, json={"detail": "없음"})


@pytest.fixture
def client(monkeypatch):
    calls.clear()
    VALID.clear()
    VALID.add("good-token")
    monkeypatch.setattr(engine, "_client",
                        httpx.Client(base_url="http://engine", transport=httpx.MockTransport(fake_engine)))
    return TestClient(app)


def test_첫_화면이_뜬다(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]


def test_구동_목록은_25개_구(client):
    gudong = client.get("/api/regions/gudong").json()
    assert len(gudong) == 25
    assert sum(len(d) for d in gudong.values()) == 427


def test_키워드는_엔진_없이_나온다(client):
    body = client.get("/api/lifetype/keywords").json()
    assert body["keywords"] and body["minPick"] >= 1
    assert calls == []


def test_1차_유형이_엔진_추천을_카드로_바꾼다(client):
    keywords = client.get("/api/lifetype/keywords").json()["all"]
    query = " ".join(keywords[:5])
    body = client.post("/api/lifetype", json={"query": query}).json()
    assert ("POST", "/recommend") in calls
    assert [s["dong"] for s in body["spots"]] == ["대치1동", "중계1동"]
    assert body["spots"][0]["name"] == "서울특별시 강남구 대치1동"


def test_엔진이_꺼져도_1차_화면은_죽지_않는다(client, monkeypatch):
    def down(request):
        raise httpx.ConnectError("엔진 꺼짐")
    monkeypatch.setattr(engine, "_client",
                        httpx.Client(base_url="http://engine", transport=httpx.MockTransport(down)))
    keywords = client.get("/api/lifetype/keywords").json()["all"]
    r = client.post("/api/lifetype", json={"query": " ".join(keywords[:5])})
    assert r.status_code == 200
    assert r.json()["spots"] == []
    assert r.json()["dataStatus"]["dbFound"] is False


def test_관리자_API는_토큰이_없으면_401(client):
    assert client.get("/api/admin/members").status_code == 401
    assert calls == []


def test_관리자_토큰이_설정_안_됐으면_아무_토큰도_안_받는다(client, monkeypatch):
    # 전에는 ADMIN_TOKEN 이 없으면 "dev-admin-token" 으로 열렸다(2026-11-15 까지)
    from routers import admin
    monkeypatch.setattr(admin, "ADMIN_TOKEN", "")
    for token in ("", "dev-admin-token"):
        assert client.get("/api/admin/members", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    assert calls == []


def test_경로_조각의_슬래시는_인코딩된다():
    # "../admin/members" 가 엔진의 다른 경로로 풀리던 문제(2026-10-05)가 되살아나지 않게
    assert engine._seg("../admin/members") == "..%2Fadmin%2Fmembers"


def test_장기_메모리는_토큰의_주인_것만_보인다(client):
    assert client.get("/api/memory").status_code == 401
    assert client.get("/api/memory", headers={"Authorization": "Bearer bad-token"}).status_code == 401
    assert ("GET", "/memory/C001") not in calls

    r = client.get("/api/memory", headers={"Authorization": "Bearer good-token"})
    assert r.status_code == 200 and r.json() == MEMORY
    assert client.delete("/api/memory", headers={"Authorization": "Bearer good-token"}).json() == {"ok": True}
    assert ("DELETE", "/memory/C001") in calls


def test_조건_하나_지우기는_칸과_값을_엔진에_넘긴다(client, monkeypatch):
    seen = []
    monkeypatch.setattr(engine, "_call", lambda method, path, **kw: seen.append((method, path, kw.get("params"))))
    monkeypatch.setattr(quota, "member_id", lambda request: "C001")
    client.delete("/api/memory", params={"field": "avoid", "value": "언덕"})
    client.delete("/api/memory")
    assert seen == [("DELETE", "/memory/C001", {"field": "avoid", "value": "언덕"}), ("DELETE", "/memory/C001", {})]


def test_채팅_답에_반영한_기억이_같이_온다(client):
    body = client.post("/api/chat", json={"question": "어디가 나아요?"}).json()
    assert body["answer"] == "응암제3동이 나아요"
    assert body["memory"] == "예산 3억 · 전세"


def test_엔진이_거절한_토큰은_곧바로_막힌다(client):
    # 웹이 토큰 확인 결과를 기억하던 때(2026-11-15 까지)는 로그아웃 · 만료 뒤에도 웹을 다시 띄울 때까지 통과했다
    H = {"Authorization": "Bearer good-token"}
    assert client.get("/api/memory", headers=H).status_code == 200
    VALID.discard("good-token")                       # 로그아웃했다 · 1시간이 지났다 — 엔진이 거절한다
    assert client.get("/api/memory", headers=H).status_code == 401
