(function () {
  const restrictedMessage = "공개버전 제한된 기능입니다.";
  const today = "2026-06-11";
  const candidateNotes = [
    "교육 일정 안내 후 시험 준비 독려",
    "위촉 절차와 제출 서류 안내",
    "희망 시험일 확인 후 일정 재안내",
    "추가 질의 확인 후 재상담 예정",
    "연락 부재로 다음 영업일 재연락 예정"
  ];
  const contractNotes = [
    "제안서 전달 후 검토 대기",
    "청약 전 보장 범위 재확인",
    "필요 서류 보완 요청",
    "기존 계약 비교 후 후속 상담 예정",
    "재터치 필요, 일정 조율 중"
  ];
  const products = [
    "건강 보장 제안",
    "간병 보장 검토",
    "치매 보장 상담",
    "종합 보장 분석",
    "운전자 보장 리모델링"
  ];
  const surnames = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오"];
  const given = ["도윤", "서준", "하준", "민재", "지호", "서연", "하윤", "지유", "수아", "예린", "유진", "나현"];
  const candidates = [];
  const candidateDetails = [];
  const staff = [];
  const staffSummary = [];
  const contracts = [];
  const unpaid = [];
  const guarantee = new Map();
  const retouchHistory = new Map();
  const demoDates = Array.from({ length: 22 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 4, 21 + index));
    return date.toISOString().slice(0, 10);
  });

  function nameAt(index) {
    return `${surnames[index % surnames.length]}${given[(index * 5 + 3) % given.length]}`;
  }

  function codeAt(index, offset = 0) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let value = "";
    let seed = index * 37 + offset * 19 + 11;
    for (let i = 0; i < 9; i += 1) {
      seed = (seed * 17 + i * 23 + 7) % chars.length;
      value += chars[seed];
    }
    return value;
  }

  function dateAt(index, startDay = 21) {
    const offset = Math.max(0, startDay - 21);
    return demoDates[(index * 3 + offset) % demoDates.length];
  }

  function maskedPhone(index) {
    const a = String(1100 + index * 137).slice(-4);
    const b = String(2300 + index * 211).slice(-4);
    return `010-${a.replace(/\d/g, "*")}-${b.replace(/\d/g, "*")}`;
  }

  function includesQuery(row, query) {
    if (!query) return true;
    const lower = query.toLowerCase();
    return Object.values(row).some((value) => String(value || "").toLowerCase().includes(lower));
  }

  function limitRows(rows, params) {
    const query = (params.get("q") || "").trim();
    const limit = Number(params.get("limit") || rows.length);
    return rows.filter((row) => includesQuery(row, query)).slice(0, Number.isFinite(limit) ? limit : rows.length);
  }

  function addCandidate(index, options = {}) {
    const code = options.code || codeAt(index, 2);
    const name = options.name || nameAt(index);
    const recent = candidateNotes[index % candidateNotes.length];
    const row = {
      배정일자: dateAt(index),
      배양코드: code,
      성명: name,
      후보진행: options.status || ["시험신청", "학습독려", "고민중", "부재중", "서류준비"][index % 5],
      합격여부: options.pass || ["-", "합격", "대기"][index % 3],
      위촉여부: options.appoint || (index % 6 === 0 ? "Y" : "N"),
      희망시험일자: ["2026-06-17", "2026-06-18", "2026-06-23", "2026-06-25", "2026-06-30"][index % 5],
      경과일수: String(3 + (index * 4) % 35),
      최근상담일자: dateAt(index, 24),
      최근상담내용: recent,
      상담이력: `${dateAt(index, 24)} ${recent} / ${dateAt(index, 22)} ${candidateNotes[(index + 1) % candidateNotes.length]}`,
      최종터치일자: dateAt(index, 24),
      합격예상: ["o", "확인", "-"][index % 3],
      시험지역: ["서울", "대전", "부산", "대구", "광주"][index % 5],
      시험일시: `${["2026-06-17", "2026-06-18", "2026-06-23", "2026-06-25", "2026-06-30"][index % 5]} 10:00~11:00`
    };
    candidates.push(row);
    for (let i = 0; i < 3; i += 1) {
      candidateDetails.push({
        배양코드: code,
        성명: name,
        상담일자: dateAt(index + i, 21 + i),
        상담진행: row.후보진행,
        통화: i % 2 === 0 ? "통화" : "부재",
        발송: i % 2 === 0 ? "안내 발송" : "-",
        상담내용: candidateNotes[(index + i) % candidateNotes.length]
      });
    }
    return row;
  }

  function addStaff(index, linkedCandidate) {
    const name = linkedCandidate?.성명 || nameAt(index + 20);
    const row = {
      신입경력: index % 3 === 0 ? "경력" : "신입",
      차월: String(1 + (index % 8)),
      성명: name,
      지점원: name,
      위촉코드: codeAt(index, 7),
      휴대폰: maskedPhone(index),
      표시상태: ["활동", "정상/확인필요", "장기 미계약"][index % 3],
      최근계약시트: ["2026-04", "2026-05", "2026-06"][index % 3],
      계약월목록: "2026-04, 2026-05, 2026-06",
      제안건수: String(2 + (index % 5)),
      고객수: String(1 + (index % 4)),
      최근제안일: dateAt(index, 24),
      고객목록: `${nameAt(index + 40)}, ${nameAt(index + 41)}`,
      상품목록: `${products[index % products.length]}, ${products[(index + 1) % products.length]}`
    };
    staff.push(row);
    staffSummary.push({
      ...row,
      누적계약건수: String(2 + (index * 2) % 11),
      당월계약건수: String(1 + (index % 3)),
      누적매출금액: String(1200000 + index * 370000),
      당월매출금액: String(340000 + index * 90000)
    });
    guarantee.set(name, {
      status: ["요청", "동의", "완료", "제한", "증액"][index % 5],
      status_label: ["요청", "동의", "완료", "제한", "증액"][index % 5],
      amount: ["300", "500", "1000"][index % 3],
      updated_at: dateAt(index, 26)
    });
    retouchHistory.set(name, [
      { 기록일: dateAt(index, 26), 터치이름: nameAt(index + 50), 재터치내용: contractNotes[index % contractNotes.length] },
      { 기록일: dateAt(index + 1, 24), 터치이름: nameAt(index + 51), 재터치내용: contractNotes[(index + 2) % contractNotes.length] }
    ]);
    return row;
  }

  for (let i = 0; i < 28; i += 1) {
    addCandidate(i, { appoint: i < 8 ? "Y" : i % 7 === 0 ? "Y" : "N" });
  }

  for (let i = 0; i < 16; i += 1) {
    addStaff(i, candidates[i]);
  }

  for (let i = 0; i < 32; i += 1) {
    const agent = staff[i % staff.length];
    const customer = nameAt(i + 70);
    const priority = ["긴급", "높음", "확인", "장기보류", "종결/거절"][i % 5];
    const stage = ["제안서 후 미청약", "보장분석 후 미제안", "청약서 있음", "체결 확인", "추가서류 확인"][i % 5];
    const product = products[i % products.length];
    const row = {
      재터치우선순위: priority,
      지점원: agent.성명,
      고객: customer,
      "상품/내용": product,
      전략상품구분: ["전략", "일반", "확인필요"][i % 3],
      진행단계: stage,
      문서종류: stage.includes("청약") ? "청약서" : "제안서",
      경과일수: String(4 + (i * 5) % 74),
      최신수정일: dateAt(i, 23),
      파일목록: `공개제한/${customer}_${product}_제안서.pdf | 공개제한/${customer}_${product}_보완서류.pdf`,
      처리키: `DEMO-${codeAt(i, 11)}`,
      처리상태: "미처리",
      처리메모: contractNotes[(i + 1) % contractNotes.length]
    };
    contracts.push(row);
  }

  staff.forEach((agent, index) => {
    unpaid.push({
      파트너스명: agent.성명,
      계약자명: nameAt(index + 90),
      구분: ["응당", "유예", "미입금"][index % 3],
      미입금처리상태: ["", "유예", "예외"][index % 3],
      대상회차: String(2 + (index % 6)),
      계약유지회차: String(1 + (index % 8)),
      집금책임액: String(120000 + index * 23000),
      상품명: products[(index + 2) % products.length],
      처리키: `UNPAID-${codeAt(index, 13)}`,
      처리메모: contractNotes[index % contractNotes.length]
    });
  });

  function dashboardTargets(target) {
    if (target === "urgent-retouch") return contracts.filter((row) => row.재터치우선순위 === "긴급");
    if (target === "retouch") return contracts;
    if (target === "upcoming-exam-candidates") return candidates.filter((row) => row.위촉여부 !== "Y").slice(0, 12);
    if (target === "stale-candidates") return candidates.filter((row) => Number(row.경과일수 || 0) >= 14 && row.위촉여부 !== "Y");
    if (target === "training-needed") return candidates.filter((row) => ["학습독려", "시험신청"].includes(row.후보진행));
    if (target === "guarantee-needed") return staff.map((row) => ({ ...row, 이행보증상태: guarantee.get(row.성명)?.status_label || "요청" }));
    if (target === "monthly-proposal-staff") return staff;
    if (target === "unpaid-premiums") return unpaid;
    return [];
  }

  function summary() {
    const retouch = contracts.filter((row) => ["긴급", "높음", "확인"].includes(row.재터치우선순위));
    const upcoming = dashboardTargets("upcoming-exam-candidates");
    const training = dashboardTargets("training-needed");
    const guarantees = dashboardTargets("guarantee-needed");
    return {
      candidate_total: candidates.length,
      candidate_exam_window: { month: "6월", group: "정규/후속" },
      retouch_priority: {
        긴급: contracts.filter((row) => row.재터치우선순위 === "긴급").length,
        높음: contracts.filter((row) => row.재터치우선순위 === "높음").length,
        확인: contracts.filter((row) => row.재터치우선순위 === "확인").length
      },
      counts: {
        "계약 재터치 대상": retouch.length,
        "다음 시험 예정자": upcoming.length,
        "보험연수원 안내 필요": training.length,
        "이행보증 현황": guarantees.length,
        "해당월 제안 지점원": staff.length,
        "미입금 확인": unpaid.length
      },
      top: {
        retouch: retouch.slice(0, 8),
        upcoming_exam_candidates: upcoming.slice(0, 8),
        training_needed: training.slice(0, 8),
        guarantee_needed: guarantees.slice(0, 8),
        monthly_proposal_staff: staff.slice(0, 8),
        unpaid_premiums: unpaid.slice(0, 8)
      }
    };
  }

  function templates() {
    return {
      "보험연수원 교육 안내": "{name}님, 보험연수원 교육 일정과 준비 항목을 다시 안내드립니다.",
      "이행보증 가입 안내": "{name}님, 위촉 이후 필요한 이행보증 진행 상태를 확인해 주세요.",
      "제안서 후 미청약 재터치": "{name}님, {product} 제안서 검토 후 청약 전 확인할 부분을 안내드립니다.",
      "학습독려": "{name}님, 다음 시험 일정 전까지 핵심 학습 범위를 다시 확인해 주세요.",
      "수수료 안내": "{name}님, {product} 관련 수수료 확인 사항을 정리해드립니다."
    };
  }

  function apiResponse(pathname, params, options) {
    if (options.method && options.method !== "GET") {
      return {
        ok: true,
        status_label: restrictedMessage,
        updated_at: today,
        message: restrictedMessage
      };
    }
    if (pathname === "/api/summary") return summary();
    if (pathname === "/api/candidates") return limitRows(candidates, params);
    if (pathname === "/api/candidate_detail") return limitRows(candidateDetails, params);
    if (pathname === "/api/staff") return limitRows(staff, params);
    if (pathname === "/api/staff_summary") return limitRows(staffSummary, params);
    if (pathname === "/api/contracts") return limitRows(contracts, params);
    if (pathname === "/api/retouch") {
      const status = params.get("status") || "";
      return limitRows(status ? contracts.filter((row) => row.재터치우선순위 === status) : contracts, params);
    }
    if (pathname === "/api/dashboard_targets") return limitRows(dashboardTargets(params.get("target") || ""), params);
    if (pathname === "/api/templates") return templates();
    if (pathname === "/api/doc_info") {
      const rawPath = params.get("path") || "";
      return {
        path: rawPath,
        label: rawPath.split("/").pop()?.replace(/\.[^.]+$/, "") || "공개 제한 문서",
        product: products[rawPath.length % products.length],
        premium: "공개 목업 금액",
        term: "공개 목업 기간"
      };
    }
    if (pathname === "/api/manual_note") {
      return { note: candidateNotes[(params.get("code") || "").length % candidateNotes.length], updated_at: today };
    }
    if (pathname === "/api/staff_override") {
      const agent = params.get("agent") || "";
      return staff.find((row) => row.성명 === agent) || {};
    }
    if (pathname === "/api/guarantee_notice") {
      return guarantee.get(params.get("agent") || "") || { status: "요청", status_label: "요청", amount: "300", updated_at: today };
    }
    if (pathname === "/api/unpaid_notice") {
      const agent = params.get("agent") || "";
      return unpaid.filter((row) => row.파트너스명 === agent);
    }
    if (pathname === "/api/retouch_history") {
      return retouchHistory.get(params.get("agent") || "") || [];
    }
    return {};
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async function demoFetch(input, init = {}) {
    const rawUrl = typeof input === "string" ? input : input?.url || "";
    const url = new URL(rawUrl, window.location.origin);
    if (url.pathname.startsWith("/api/")) {
      const payload = apiResponse(url.pathname, url.searchParams, { method: (init.method || "GET").toUpperCase() });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
    return realFetch(input, init);
  };

  function showRestrictedStatus(target) {
    const scope = target.closest(".detail-panel, .sidebar, .panel") || document;
    let status = null;
    if (target.matches("#refreshButton")) status = document.getElementById("refreshStatus");
    if (target.matches("#saveManualNote")) status = scope.querySelector("#manualNoteStatus");
    if (target.matches("#saveStaffOverride")) status = scope.querySelector("#staffOverrideStatus");
    if (target.matches("#saveGuaranteeNotice")) status = scope.querySelector("#guaranteeNoticeStatus");
    if (target.matches("[data-retouch-action]")) status = scope.querySelector("#retouchActionStatus");
    if (target.matches("[data-unpaid-save], [data-unpaid-reset]")) {
      const index = target.dataset.unpaidSave || target.dataset.unpaidReset;
      status = scope.querySelector(`[data-unpaid-message="${index}"]`) || scope.querySelector("[data-unpaid-message]");
    }
    status = status || document.getElementById("refreshStatus");
    if (status) {
      status.textContent = restrictedMessage;
      return;
    }
    window.alert(restrictedMessage);
  }

  document.addEventListener("click", (event) => {
    const restricted = event.target.closest(
      [
        "[data-demo-restricted]",
        "a[href^='/file']",
        "#refreshButton",
        "#saveManualNote",
        "#saveStaffOverride",
        "#saveGuaranteeNotice",
        "[data-retouch-action]",
        "[data-unpaid-save]",
        "[data-unpaid-reset]"
      ].join(", ")
    );
    if (!restricted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showRestrictedStatus(restricted);
  }, true);

  window.MERITZ_DEMO_DATA = {
    candidates,
    candidateDetails,
    staff,
    staffSummary,
    contracts,
    unpaid
  };
})();
