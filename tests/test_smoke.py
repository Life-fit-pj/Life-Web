"""웹 서버 스모크 테스트. 엔진(:8000)은 띄우지 않고 가짜 응답으로 바꿔 끼운다.

실행: py -m pytest tests -q   (저장소 뿌리에서)

보는 것은 "서버가 뜨고, 라우터가 엔진 응답을 화면 형식으로 바꿔 주나" 까지다.
추천 품질은 엔진 저장소가 잰다.
"""

import httpx
import pytest
from fastapi.testclient import TestClient

from main import app
from services import engine

# 엔진이 받은 요청을 기록해 두고 정해 둔 응답을 돌려준다
calls = []


def fake_engine(request: httpx.Request) -> httpx.Response:
    calls.append((request.method, request.url.path))
    if request.url.path == "/recommend":
        return httpx.Response(200, json=[
            {"name": "강남구 대치1동", "total": 91.2, "scores": {}, "counts": {"학원": 120}},
            {"name": "노원구 중계1동", "total": 88.0, "scores": {}, "counts": {"학원": 80}},
        ])
    return httpx.Response(404, json={"detail": "없음"})


@pytest.fixture
def client(monkeypatch):
    calls.clear()
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


def test_경로_조각의_슬래시는_인코딩된다():
    # "../admin/members" 가 엔진의 다른 경로로 풀리던 문제(2026-10-05)가 되살아나지 않게
    assert engine._seg("../admin/members") == "..%2Fadmin%2Fmembers"
