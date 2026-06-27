/**
 * LabPage ('실험실') — 코스/세그먼트 시뮬레이터 (#287).
 *
 * 체중·장비(CdA/Crr/효율)·능력(PDC)으로 코스의 예상 소요시간·필요파워·PR 을 예측한다.
 * 물리 모델은 `@shared/sim/courseSim` 의 순수 함수에 위임 — 이 페이지는 입력 수집/표시만 담당.
 *
 * 3 모드:
 *  ① power      — 일정 파워 → 예상 시간/평속
 *  ② targetTime — 목표 시간 → 필요 평균 파워
 *  ③ pr         — PDC(CP/W') 기반 PR 예측
 *
 * 베타: 바람/드래프팅/가감속 미반영 — 정확도 미보장 (배너 고지).
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
} from "firebase/firestore";
import { firestore } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import { useGear } from "../hooks/useGear";
import { usePdc } from "../hooks/usePdc";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Select,
  Stack,
  Stat,
  Text,
} from "../theme/components";
import {
  simulateCourse,
  requiredPowerForTime,
  predictPR,
  DEFAULT_CDA,
  DEFAULT_CRR,
  DEFAULT_ETA,
  type SimSegment,
} from "@shared/sim/courseSim";

interface CourseLite {
  id: string;
  name: string;
  distance: number;
  elevationGain: number;
  elevationProfile?: { d: number; e: number }[];
}

type SimMode = "power" | "targetTime" | "pr";

/**
 * 코스 고도 프로파일(누적거리 d, 고도 e)을 시뮬레이션 구간(거리/경사)으로 변환.
 * 인접 샘플 간 Δ거리/Δ고도로 grade(=Δe/Δd)를 구한다.
 */
function profileToSegments(profile: { d: number; e: number }[]): SimSegment[] {
  if (!profile || profile.length < 2) return [];
  const segs: SimSegment[] = [];
  for (let i = 1; i < profile.length; i++) {
    const cur = profile[i]!;
    const prev = profile[i - 1]!;
    const dDist = cur.d - prev.d;
    if (!(dDist > 0)) continue;
    const dEle = cur.e - prev.e;
    segs.push({ distanceM: dDist, grade: dEle / dDist });
  }
  return segs;
}

function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "--";
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "h:mm:ss" 또는 "mm:ss" 문자열 → 초. 파싱 실패 시 NaN. */
function parseDuration(str: string): number {
  const parts = str.split(":").map((p) => Number(p.trim()));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return NaN;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 1) return parts[0]!;
  return NaN;
}

export default function LabPage() {
  const { t } = useTranslation("lab");
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;
  const [searchParams] = useSearchParams();

  // ── 코스 목록 (내 코스) + URL courseId 직접 로드 ──────────────────────
  const [courses, setCourses] = useState<CourseLite[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    if (!uid) {
      setCourses([]);
      return;
    }
    const q = query(
      collection(firestore, "courses"),
      where("creatorId", "==", uid),
      where("deletedAt", "==", null),
    );
    const unsub = onSnapshot(q, (snap) => {
      setCourses(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name ?? "",
            distance: data.distance ?? 0,
            elevationGain: data.elevationGain ?? 0,
            elevationProfile: data.elevationProfile,
          };
        }),
      );
    });
    return () => unsub();
  }, [uid]);

  // URL ?courseId= 우선 — 내 코스 아니어도 직접 로드해 옵션에 추가.
  const urlCourseId = searchParams.get("courseId");
  useEffect(() => {
    if (!urlCourseId) return;
    setSelectedId(urlCourseId);
    if (courses.some((c) => c.id === urlCourseId)) return;
    let cancelled = false;
    getDoc(doc(firestore, "courses", urlCourseId)).then((snap) => {
      if (cancelled || !snap.exists()) return;
      const data = snap.data();
      setCourses((prev) =>
        prev.some((c) => c.id === urlCourseId)
          ? prev
          : [
              {
                id: urlCourseId,
                name: data.name ?? "",
                distance: data.distance ?? 0,
                elevationGain: data.elevationGain ?? 0,
                elevationProfile: data.elevationProfile,
              },
              ...prev,
            ],
      );
    });
    return () => {
      cancelled = true;
    };
  }, [urlCourseId, courses]);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedId) ?? null,
    [courses, selectedId],
  );

  const segments = useMemo(
    () => profileToSegments(selectedCourse?.elevationProfile ?? []),
    [selectedCourse],
  );

  // ── 장비 (기본 바이크에서 cda/crr/eta 자동) ────────────────────────────
  const { items: gearItems } = useGear(uid);
  const defaultBike = useMemo(
    () =>
      gearItems.find((g) => g.type === "bike" && g.isDefault) ??
      gearItems.find((g) => g.type === "bike") ??
      null,
    [gearItems],
  );

  // ── 능력 (PDC) ─────────────────────────────────────────────────────────
  const pdcState = usePdc(uid);
  const cp = pdcState.pdc?.cp?.value ?? pdcState.pdc?.pdcModel?.cpEst ?? 0;
  const wPrime =
    pdcState.pdc?.cp?.wPrime ?? pdcState.pdc?.pdcModel?.frc ?? 0;

  // ── 파라미터 (장비/프로필 기본 + 수동 오버라이드) ─────────────────────
  const [riderKg, setRiderKg] = useState<string>("");
  const [cda, setCda] = useState<string>("");
  const [crr, setCrr] = useState<string>("");
  const [eta, setEta] = useState<string>("");
  const [powerW, setPowerW] = useState<string>("220");
  const [targetTime, setTargetTime] = useState<string>("");
  const [mode, setMode] = useState<SimMode>("power");

  // 프로필 체중 기본값 주입 (사용자가 비웠다면).
  useEffect(() => {
    if (profile?.weightKg && riderKg === "") {
      setRiderKg(String(profile.weightKg));
    }
  }, [profile?.weightKg, riderKg]);

  // 기본 바이크에서 cda/crr/eta 기본값 주입.
  useEffect(() => {
    if (!defaultBike) return;
    if (cda === "" && defaultBike.cda != null) setCda(String(defaultBike.cda));
    if (crr === "" && defaultBike.crr != null) setCrr(String(defaultBike.crr));
    if (eta === "" && defaultBike.drivetrainEfficiency != null)
      setEta(String(defaultBike.drivetrainEfficiency));
  }, [defaultBike, cda, crr, eta]);

  // 수치 파싱 (빈 값/오타는 기본값).
  const riderMass = Number(riderKg) || profile?.weightKg || 70;
  const bikeMass = defaultBike?.weightKg ?? 8; // 장비 무게 기본 8kg
  const massKg = riderMass + bikeMass;
  const cdaNum = Number(cda) || DEFAULT_CDA;
  const crrNum = Number(crr) || DEFAULT_CRR;
  const etaNum = Number(eta) || DEFAULT_ETA;
  const physParams = { massKg, cda: cdaNum, crr: crrNum, eta: etaNum };

  // ── 결과 계산 ──────────────────────────────────────────────────────────
  const result = useMemo(() => {
    if (segments.length === 0) return null;

    if (mode === "power") {
      const p = Number(powerW);
      if (!(p > 0)) return null;
      const sim = simulateCourse(segments, { ...physParams, powerW: p });
      return {
        kind: "power" as const,
        totalSec: sim.totalSec,
        avgSpeedKmh: sim.avgSpeedKmh,
        powerW: p,
      };
    }

    if (mode === "targetTime") {
      const tSec = parseDuration(targetTime);
      if (!Number.isFinite(tSec) || tSec <= 0) return null;
      const reqP = requiredPowerForTime(segments, tSec, physParams);
      const sim = simulateCourse(segments, { ...physParams, powerW: reqP });
      return {
        kind: "targetTime" as const,
        totalSec: sim.totalSec,
        avgSpeedKmh: sim.avgSpeedKmh,
        powerW: reqP,
        targetSec: tSec,
      };
    }

    // pr
    if (!(cp > 0)) return { kind: "pr-missing" as const };
    const pr = predictPR(segments, cp, wPrime, physParams);
    return {
      kind: "pr" as const,
      totalSec: pr.totalSec,
      avgSpeedKmh: pr.avgSpeedKmh,
      powerW: pr.sustainablePowerW,
    };
  }, [segments, mode, powerW, targetTime, cp, wPrime, physParams]);

  if (!uid) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--space-4)" }}>
        <Alert variant="info" title={t("loginRequired.title")}>
          {t("loginRequired.body")}
        </Alert>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "var(--space-4)" }}>
      <Stack gap="var(--space-4)">
        <div>
          <Text as="h1" variant="title" size="xl">
            {t("title")}
          </Text>
          <Text as="p" tone="secondary">
            {t("subtitle")}
          </Text>
        </div>

        <Alert variant="warning" title={t("beta.title")}>
          {t("beta.body")}
        </Alert>

        {/* 코스 선택 */}
        <Card title={t("course.title")}>
          <Field label={t("course.select")}>
            <Select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">{t("course.placeholder")}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.id}
                </option>
              ))}
            </Select>
          </Field>
          {selectedCourse && (
            <div
              style={{
                display: "flex",
                gap: "var(--space-4)",
                marginTop: "var(--space-2)",
              }}
            >
              <Stat
                label={t("course.distance")}
                value={(selectedCourse.distance / 1000).toFixed(1)}
                unit="km"
              />
              <Stat
                label={t("course.elevation")}
                value={Math.round(selectedCourse.elevationGain)}
                unit="m"
              />
              <Stat label={t("course.segments")} value={segments.length} />
            </div>
          )}
          {selectedCourse && segments.length === 0 && (
            <Text as="p" tone="secondary" style={{ marginTop: "var(--space-2)" }}>
              {t("course.noProfile")}
            </Text>
          )}
        </Card>

        {/* 파라미터 */}
        <Card title={t("params.title")}>
          <Stack gap="var(--space-3)">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-3)",
              }}
            >
              <Field label={t("params.riderKg")} hint={t("params.riderKgHint")}>
                <Input
                  type="number"
                  mono
                  value={riderKg}
                  onChange={(e) => setRiderKg(e.target.value)}
                  placeholder="70"
                />
              </Field>
              <Field
                label={t("params.bikeKg")}
                hint={
                  defaultBike
                    ? t("params.bikeKgFrom", { name: defaultBike.name })
                    : t("params.bikeKgDefault")
                }
              >
                <Input type="number" mono value={String(bikeMass)} disabled />
              </Field>
              <Field label={t("params.cda")} hint={t("params.cdaHint")}>
                <Input
                  type="number"
                  step="0.01"
                  mono
                  value={cda}
                  onChange={(e) => setCda(e.target.value)}
                  placeholder={String(DEFAULT_CDA)}
                />
              </Field>
              <Field label={t("params.crr")} hint={t("params.crrHint")}>
                <Input
                  type="number"
                  step="0.001"
                  mono
                  value={crr}
                  onChange={(e) => setCrr(e.target.value)}
                  placeholder={String(DEFAULT_CRR)}
                />
              </Field>
              <Field label={t("params.eta")} hint={t("params.etaHint")}>
                <Input
                  type="number"
                  step="0.01"
                  mono
                  value={eta}
                  onChange={(e) => setEta(e.target.value)}
                  placeholder={String(DEFAULT_ETA)}
                />
              </Field>
            </div>
          </Stack>
        </Card>

        {/* 모드 + 입력 */}
        <Card title={t("mode.title")}>
          <Stack gap="var(--space-3)">
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              {(["power", "targetTime", "pr"] as SimMode[]).map((m) => (
                <Button
                  key={m}
                  variant={mode === m ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setMode(m)}
                >
                  {t(`mode.${m}`)}
                </Button>
              ))}
            </div>

            {mode === "power" && (
              <Field label={t("mode.powerInput")} hint={t("mode.powerHint")}>
                <Input
                  type="number"
                  mono
                  value={powerW}
                  onChange={(e) => setPowerW(e.target.value)}
                  placeholder="220"
                />
              </Field>
            )}

            {mode === "targetTime" && (
              <Field
                label={t("mode.targetTimeInput")}
                hint={t("mode.targetTimeHint")}
              >
                <Input
                  type="text"
                  mono
                  value={targetTime}
                  onChange={(e) => setTargetTime(e.target.value)}
                  placeholder="1:05:00"
                />
              </Field>
            )}

            {mode === "pr" && (
              <Text as="p" tone="secondary">
                {cp > 0
                  ? t("mode.prReady", { cp: Math.round(cp), wPrime: Math.round(wPrime) })
                  : t("mode.prMissing")}
              </Text>
            )}
          </Stack>
        </Card>

        {/* 결과 */}
        {selectedCourse && segments.length > 0 && result && (
          <Card title={t("result.title")}>
            {result.kind === "pr-missing" ? (
              <Alert variant="info">{t("mode.prMissing")}</Alert>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "var(--space-4)",
                }}
              >
                <Stat
                  label={t("result.time")}
                  value={fmtDuration(result.totalSec)}
                />
                <Stat
                  label={t("result.avgSpeed")}
                  value={result.avgSpeedKmh.toFixed(1)}
                  unit="km/h"
                />
                <Stat
                  label={
                    result.kind === "targetTime"
                      ? t("result.requiredPower")
                      : t("result.power")
                  }
                  value={Math.round(result.powerW)}
                  unit="W"
                />
              </div>
            )}
            <Text as="p" tone="secondary" size="sm" style={{ marginTop: "var(--space-3)" }}>
              {t("result.disclaimer")}
            </Text>
          </Card>
        )}
      </Stack>
    </div>
  );
}
