"use client";

import { useEffect, useRef, useState } from "react";
import { publicEnv } from "@/lib/env";

export type ShareMapSchool = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  imageUrl?: string;
  postId: string;
  itemCount: number;
};

type KakaoWindow = Window & { kakao?: any };

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

export function ShareMap({ center, radiusKm, schools }: {
  center: { name: string; lat: number; lng: number };
  radiusKm: number;
  schools: ShareMapSchool[];
}) {
  const mapNode = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!publicEnv.kakaoJavaScriptKey || !mapNode.current) return;
    const win = window as KakaoWindow;

    const draw = () => win.kakao.maps.load(() => {
      if (!mapNode.current) return;
      const kakao = win.kakao;
      const centerPoint = new kakao.maps.LatLng(center.lat, center.lng);
      const map = new kakao.maps.Map(mapNode.current, { center: centerPoint, level: 7 });
      const bounds = new kakao.maps.LatLngBounds();
      bounds.extend(centerPoint);

      new kakao.maps.Circle({
        center: centerPoint,
        radius: radiusKm * 1000,
        strokeWeight: 2,
        strokeColor: "#1f7a4d",
        strokeOpacity: 0.8,
        fillColor: "#4fbf87",
        fillOpacity: 0.08,
      }).setMap(map);

      new kakao.maps.Marker({ map, position: centerPoint, title: `내 학교: ${center.name}` });

      schools.forEach((school) => {
        const position = new kakao.maps.LatLng(school.lat, school.lng);
        bounds.extend(position);
        const image = school.imageUrl
          ? `<img src="${escapeHtml(school.imageUrl)}" alt="" />`
          : `<span class="share-map-placeholder">📦</span>`;
        const schoolName = escapeHtml(school.name);
        const postId = encodeURIComponent(school.postId);
        const overlay = new kakao.maps.CustomOverlay({
          map,
          position,
          yAnchor: 1.15,
          content: `<a class="share-map-marker" href="/share/${postId}" aria-label="${schoolName}의 물건 보기">${image}<span>${schoolName}${school.itemCount > 1 ? ` · ${school.itemCount}개` : ""}</span></a>`,
        });
        overlay.setMap(map);
      });

      if (schools.length > 0) map.setBounds(bounds, 48, 48, 48, 48);
    });

    if (win.kakao?.maps) {
      draw();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>("script[data-share-kakao-map]");
    if (existing) {
      existing.addEventListener("load", draw, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.dataset.shareKakaoMap = "true";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${publicEnv.kakaoJavaScriptKey}&autoload=false`;
    script.async = true;
    script.onload = draw;
    script.onerror = () => setFailed(true);
    document.head.appendChild(script);
  }, [center, radiusKm, schools]);

  if (!publicEnv.kakaoJavaScriptKey) return <p className="notice notice-warn">지도 사용을 위해 NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY를 설정해 주세요.</p>;
  if (failed) return <p className="notice notice-error">카카오맵을 불러오지 못했습니다.</p>;
  return <div ref={mapNode} className="share-map" aria-label={`${radiusKm}km 이내 나눔 지도`} />;
}
