const state = {
  page: "dashboard",
  role: "manager",
  templates: {},
  contractStatus: "",
  candidateRows: [],
  candidateDetailRows: [],
  candidateStaleOnly: false,
  candidateScheduleOpen: false,
  contractRows: [],
  candidateFiltersReady: false,
  dashboardFocus: "",
  dashboardFocusRows: [],
  chatDataReady: false,
  chatData: {},
  chatResults: [],
  sort: {},
  manualNoteTarget: null,
  detailBack: null,
};

const endpoints = {
  summary: "/api/summary",
  candidates: "/api/candidates",
  staff: "/api/staff",
  staffSummary: "/api/staff_summary",
  candidateDetail: "/api/candidate_detail",
  contracts: "/api/contracts",
  retouch: "/api/retouch",
  dashboardTargets: "/api/dashboard_targets",
  templates: "/api/templates",
  docInfo: "/api/doc_info",
  manualNote: "/api/manual_note",
  staffOverride: "/api/staff_override",
  retouchHistory: "/api/retouch_history",
  retouchAction: "/api/retouch_action",
  guaranteeNotice: "/api/guarantee_notice",
  unpaidNotice: "/api/unpaid_notice",
};

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`요청 실패: ${response.status}`);
  return response.json();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function badge(value) {
  const text = escapeHtml(value || "미분류");
  const cls =
    value === "긴급" || value === "해촉" || value === "유예"
      ? "danger"
      : value === "높음" || value === "장기 미계약"
        ? "warn"
        : value === "청약서 있음" || value === "정상/확인필요" || value === "입금"
          ? "ok"
          : value === "응당" || value === "예외"
            ? "info"
            : value === "시험신청"
              ? "candidate-apply"
              : value === "부재중"
                ? "candidate-missed"
                : value === "고민중"
                  ? "candidate-consider"
                  : value === "학습독려"
                    ? "candidate-study"
                    : "";
  return `<span class="badge ${cls}">${text}</span>`;
}

function personLabel(name, suffix = "") {
  const clean = String(name || "").trim();
  if (!clean) return "";
  return `${clean}${suffix}`;
}

function compactText(value, max = 90) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function countValue(counts, key) {
  return Number(counts?.[key] || 0);
}

function renderPriorityStrip(items) {
  document.getElementById("dashboardPriority").innerHTML = items
    .map(
      (item) => `
        <article class="priority-card ${item.tone || ""} ${item.target ? "clickable" : ""}" ${item.target ? `data-dashboard-target="${escapeHtml(item.target)}"` : ""}>
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
        </article>
      `,
    )
    .join("");
}

function detailHeading(title, backTarget) {
  return `
    <div class="detail-heading">
      <h3>${title}</h3>
      <button class="back-button" data-back-target="${escapeHtml(backTarget)}">뒤로 가기</button>
    </div>
  `;
}

function todayDate() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function retouchActionPanel(row) {
  if (!row.재터치우선순위) return "";
  const currentStatus = row.처리상태 || "미처리";
  const followUp = row.추후연락일 || todayDate();
  return `
    <section class="retouch-action-panel">
      <div class="retouch-action-header">
        <div>
          <strong>재터치 처리</strong>
          <span>현재 상태: ${escapeHtml(currentStatus)}${row.처리일시 ? ` · ${escapeHtml(row.처리일시)}` : ""}</span>
        </div>
        <span id="retouchActionStatus" class="muted"></span>
      </div>
      <label class="manual-note">
        <span>처리 메모</span>
        <textarea id="retouchActionNote" placeholder="재터치 결과나 다음 액션을 적어두세요.">${escapeHtml(row.처리메모 || "")}</textarea>
      </label>
      <div class="retouch-action-row">
        <label class="field compact-field">
          <span>추후 연락일</span>
          <input id="retouchFollowUpDate" type="date" value="${escapeHtml(followUp)}" />
        </label>
        <div class="retouch-buttons">
          <button class="secondary-button" data-retouch-action="checked_today">오늘 확인</button>
          <button class="primary-button small-button" data-retouch-action="retouched">재터치 완료</button>
          <button class="secondary-button" data-retouch-action="follow_up">추후 연락</button>
          <button class="secondary-button" data-retouch-action="hold">장기보류</button>
          <button class="secondary-button" data-retouch-action="closed">종결/거절</button>
          <button class="text-button" data-retouch-action="reset">처리 해제</button>
        </div>
      </div>
    </section>
  `;
}

function manualNotePanel(key, manualNote = {}, placeholder = "상담현황에 없는 마지막 연락 내용을 적어두세요.") {
  const history = manualNote.note
    ? `<div class="manual-note-history"><strong>기존 수기 메모</strong><div>${escapeHtml(manualNote.note)}</div></div>`
    : "";
  return `
    <label class="manual-note">
      <span>수기 입력</span>
      <textarea id="manualNoteInput" data-code="${escapeHtml(key || "")}" placeholder="${escapeHtml(placeholder)}"></textarea>
    </label>
    <div class="manual-note-actions">
      <button id="saveManualNote" class="primary-button small-button">수기 메모 저장</button>
      <span id="manualNoteStatus" class="muted">${manualNote.updated_at ? `최근 저장 ${escapeHtml(manualNote.updated_at)}` : ""}</span>
    </div>
    ${history}
  `;
}

function guaranteeNoticePanel(agentName, notice) {
  const statusText = notice.status_label || notice.status || "요청";
  const amount = notice.amount || "";
  const statuses = ["요청", "동의", "완료", "제한", "증액"];
  const amounts = ["300", "500", "1000"];
  return `
    <section class="retouch-action-panel">
      <div class="retouch-action-header">
        <div>
          <strong>이행보증 현황</strong>
          <span>현재 상태: ${escapeHtml(statusText)}${notice.updated_at ? ` · ${escapeHtml(notice.updated_at)}` : ""}</span>
        </div>
        <span id="guaranteeNoticeStatus" class="muted"></span>
      </div>
      <div class="guarantee-controls">
        <div>
          <span class="control-label">금액</span>
          <div class="retouch-buttons">
            ${amounts
              .map((item) => `<button class="secondary-button ${amount === item ? "active" : ""}" data-guarantee-amount="${item}" type="button">${item}</button>`)
              .join("")}
          </div>
        </div>
        <div>
          <span class="control-label">상태</span>
          <div class="retouch-buttons">
            ${statuses
              .map((item) => `<button class="secondary-button ${statusText === item ? "active" : ""}" data-guarantee-status="${item}" type="button">${item}</button>`)
              .join("")}
          </div>
        </div>
      </div>
      <input id="guaranteeState" type="hidden" data-agent="${escapeHtml(agentName)}" data-amount="${escapeHtml(amount)}" data-status="${escapeHtml(statusText)}" />
      <div class="retouch-buttons">
        <button class="primary-button small-button" id="saveGuaranteeNotice" type="button">저장</button>
        <button class="text-button" data-guarantee-action="reset" type="button">처리 해제</button>
      </div>
    </section>
  `;
}

function unpaidNoticePanel(rows = []) {
  const cards = rows.length
    ? rows
        .map((row, index) => {
          const statusText = row.미입금처리상태 || "";
          const statuses = ["입금", "유예", "예외"];
          return `
            <article class="unpaid-card" data-unpaid-card="${index}">
              <div class="unpaid-card-head">
                <strong>${escapeHtml(row.계약자명 || "계약자 미확인")}</strong>
                <span>${badge(row.구분 || "미입금")} ${statusText ? badge(statusText) : ""}</span>
              </div>
              <div class="unpaid-meta">
                <span>상품명 <strong>${escapeHtml(row.상품명 || "-")}</strong></span>
                <span>집금책임액 <strong>${money(row.집금책임액 || 0)}원</strong></span>
                <span>대상회차 <strong>${escapeHtml(row.대상회차 || "-")}회차</strong></span>
                <span>유지회차 <strong>${escapeHtml(row.계약유지회차 || "-")}회차</strong></span>
              </div>
              <label class="manual-note unpaid-note">
                <span>메모</span>
                <textarea data-unpaid-note="${index}" placeholder="통화 결과나 예외 사유를 적어두세요.">${escapeHtml(row.미입금메모 || "")}</textarea>
              </label>
              <input type="hidden" data-unpaid-state="${index}" data-status="${escapeHtml(statusText)}" data-key="${escapeHtml(row.처리키 || "")}" />
              <div class="unpaid-actions">
                <div class="retouch-buttons">
                  ${statuses
                    .map((item) => `<button class="secondary-button ${statusText === item ? "active" : ""}" data-unpaid-status="${escapeHtml(item)}" data-unpaid-index="${index}" type="button">${escapeHtml(item)}</button>`)
                    .join("")}
                </div>
                <div class="retouch-buttons">
                  <button class="primary-button small-button" data-unpaid-save="${index}" type="button">저장</button>
                  <button class="text-button" data-unpaid-reset="${index}" type="button">처리 해제</button>
                </div>
              </div>
              <span class="muted" data-unpaid-message="${index}">${row.미입금처리일시 ? `최근 저장 ${escapeHtml(row.미입금처리일시)}` : ""}</span>
            </article>
          `;
        })
        .join("")
    : `<div class="muted">현재 미입금 확인 대상이 없습니다.</div>`;
  window.staffUnpaidRows = rows;
  return `
    <section class="retouch-action-panel">
      <div class="retouch-action-header">
        <div>
          <strong>미입금 현황</strong>
          <span>현재 집금책임액 파일에 남아 있는 미입금 건입니다.</span>
        </div>
      </div>
      <div class="unpaid-list">${cards}</div>
    </section>
  `;
}

function lazyStaffSection(title, section, agentName, code = "") {
  return `
    <section class="lazy-detail-section">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <div class="muted" data-lazy-status="${escapeHtml(section)}">필요할 때만 불러옵니다.</div>
      </div>
      <button class="secondary-button small-button" data-load-staff-section="${escapeHtml(section)}" data-agent="${escapeHtml(agentName)}" data-code="${escapeHtml(code)}" type="button">펼쳐보기</button>
      <div class="lazy-detail-body" data-lazy-body="${escapeHtml(section)}"></div>
    </section>
  `;
}

function compareValues(a, b) {
  const left = String(a ?? "").trim();
  const right = String(b ?? "").trim();
  const leftNumber = Number(left.replaceAll(",", ""));
  const rightNumber = Number(right.replaceAll(",", ""));
  if (left && right && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right, "ko-KR", { numeric: true, sensitivity: "base" });
}

function sortedRows(targetId, rows) {
  const sort = state.sort[targetId];
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const result = compareValues(a[sort.key], b[sort.key]);
    return sort.direction === "desc" ? -result : result;
  });
}

function candidateIdentity(row) {
  return `${row.배양코드 || ""}|${row.성명 || ""}`;
}

function narrowCandidateRowsForDetail(rows, query) {
  if (!query || !rows.length) return rows;
  const exact = rows.find((row) => String(row.배양코드).toLowerCase() === query || String(row.성명).toLowerCase() === query);
  const selected = exact || rows[0];
  return rows.filter((row) => candidateIdentity(row) === candidateIdentity(selected));
}

function candidateColumns() {
  return [
    { key: "배정일자", label: "배정일자", max: 18 },
    { key: "배양코드", label: "배양코드", max: 20 },
    { key: "성명", label: "성명", max: 20 },
    { key: "후보진행", label: "진행", badge: true },
    { key: "합격여부", label: "합격", max: 10 },
    { key: "위촉여부", label: "위촉", max: 10 },
    { key: "희망시험일자", label: "희망시험", max: 16 },
    { key: "경과일수", label: "경과", max: 10 },
    { key: "최근상담일자", label: "최근상담", max: 20 },
    { key: "최근상담내용", label: "최근 내용", max: 90 },
  ];
}

function staffColumns() {
  return [
    { key: "신입경력", label: "구분", max: 20 },
    { key: "차월", label: "차월", max: 10 },
    { key: "성명", label: "성명", max: 20 },
    { key: "위촉코드", label: "위촉코드", max: 20 },
    { key: "휴대폰", label: "휴대폰", max: 20 },
    { key: "표시상태", label: "상태", badge: true },
  ];
}

function renderCandidateRows(rows) {
  renderTable("candidateTable", rows, candidateColumns(), { rowAction: "candidate-detail" });
}

function renderStaffRows(rows) {
  renderTable("staffTable", rows, staffColumns(), { rowAction: "staff-detail" });
}

function candidateManagementRows() {
  return state.candidateRows.filter((row) => row.위촉여부 !== "Y");
}

function isStaleCandidate(row) {
  return row.위촉여부 !== "Y" && !["거절", ""].includes(row.후보진행 || "") && Number(row.경과일수 || 0) >= 14;
}

function renderTable(targetId, rows, columns, options = {}) {
  const target = document.getElementById(targetId);
  if (!rows.length) {
    window.tableRows = window.tableRows || {};
    window.tableRows[targetId] = [];
    target.innerHTML = `<div class="compact-item"><strong>표시할 자료가 없습니다.</strong></div>`;
    return;
  }

  const activeSort = state.sort[targetId] || {};
  const displayRows = sortedRows(targetId, rows);
  window.tableRows = window.tableRows || {};
  window.tableRows[targetId] = displayRows;

  const head = columns
    .map((column) => {
      const marker = activeSort.key === column.key ? (activeSort.direction === "asc" ? "▲" : "▼") : "";
      return `<th><button class="sort-button" data-sort-target="${escapeHtml(targetId)}" data-sort-key="${escapeHtml(column.key)}">${escapeHtml(column.label)} <span>${marker}</span></button></th>`;
    })
    .join("");
  const body = displayRows
    .map((row, index) => {
      const cells = columns
        .map((column) => {
          const raw = row[column.key] || "";
          const value = column.badge ? badge(raw) : escapeHtml(compactText(raw, column.max || 120));
          return `<td>${value}</td>`;
        })
        .join("");
      const rowAction = options.rowAction ? ` class="clickable-row" data-row-action="${escapeHtml(options.rowAction)}" data-row-index="${index}"` : "";
      return `<tr${rowAction}>${cells}</tr>`;
    })
    .join("");

  target.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderCompactList(targetId, rows, mapper) {
  const target = document.getElementById(targetId);
  if (!rows || !rows.length) {
    target.innerHTML = `<div class="compact-item"><strong>대상이 없습니다.</strong></div>`;
    return;
  }
  target.innerHTML = rows
    .map((row, index) => {
      const item = mapper(row, index);
      const title = item.titleHtml || escapeHtml(item.title);
      const clickableClass = item.action ? " clickable" : "";
      const action = item.action ? ` data-action="${escapeHtml(item.action)}" data-key="${escapeHtml(item.key || "")}"` : "";
      return `<div class="compact-item${clickableClass}"${action}><strong>${title}</strong><span>${escapeHtml(item.detail)}</span></div>`;
    })
    .join("");
}

function renderUnpaidFocusRows(rows) {
  const target = document.getElementById("dashboardFocusList");
  if (!rows.length) {
    target.innerHTML = `<div class="compact-item"><strong>대상이 없습니다.</strong></div>`;
    return;
  }
  const mapper = dashboardMapperForTarget("unpaid-premiums");
  const sections = [
    ["2~4회차", rows.map((row, index) => ({ row, index })).filter((item) => {
      const round = Number(String(item.row.대상회차 || "").replace(/[^0-9]/g, ""));
      return round >= 2 && round <= 4;
    })],
    ["5회차 이상", rows.map((row, index) => ({ row, index })).filter((item) => {
      const round = Number(String(item.row.대상회차 || "").replace(/[^0-9]/g, ""));
      return round >= 5;
    })],
  ];
  target.innerHTML = sections
    .map(([title, items]) => {
      const body = items.length
        ? items
            .map(({ row, index }) => {
              const item = mapper(row, index);
              return `<div class="compact-item clickable" data-action="${escapeHtml(item.action)}" data-key="${escapeHtml(item.key || "")}"><strong>${item.titleHtml}</strong><span>${escapeHtml(item.detail)}</span></div>`;
            })
            .join("")
        : `<div class="compact-item"><strong>대상이 없습니다.</strong></div>`;
      return `<section class="dashboard-subsection"><h4>${escapeHtml(title)} · ${money(items.length)}건</h4><div class="compact-list task-list">${body}</div></section>`;
    })
    .join("");
}

const metricTargetByLabel = {
  "계약 재터치 대상": "retouch",
  "다음 시험 예정자": "upcoming-exam-candidates",
  "보험연수원 안내 필요": "training-needed",
  "이행보증 현황": "guarantee-needed",
  "미입금 확인": "unpaid-premiums",
  "장기 미계약 지점원": "inactive-staff",
  "해당월 제안 지점원": "monthly-proposal-staff",
  "활동 지점원": "active-staff",
};

const dashboardTargetTitles = {
  "urgent-retouch": ["긴급 재터치", "30~59일 경과한 제안서 후 미청약 대상입니다."],
  retouch: ["계약 재터치 대상", "확인, 높음, 긴급으로 관리할 계약 재터치 대상입니다."],
  "upcoming-exam-candidates": ["다음 시험 예정자", "현재 기준으로 안내해야 할 다음 시험 예정 후보자입니다."],
  "stale-candidates": ["후보자 장기 미터치", "최근 터치가 오래 지난 후보자입니다."],
  "training-needed": ["보험연수원 안내 필요", "시험 합격 후 보험연수원 교육 안내가 필요한 후보자입니다."],
  "guarantee-needed": ["이행보증 현황", "요청, 동의, 제한, 증액 상태인 이행보증 진행 건입니다."],
  "unpaid-premiums": ["미입금 확인", "이번 달 보험료 미입금 확인 대상입니다."],
  "monthly-proposal-staff": ["해당월 제안 지점원", "이번 달 제안서를 전달한 지점원입니다."],
  "inactive-staff": ["장기 미계약 지점원", "해촉은 아니지만 장기간 계약이 없는 지점원입니다."],
  "active-staff": ["활동 지점원", "현재 해촉이 아닌 지점원 전체입니다."],
};

const dashboardTargetUnits = {
  "upcoming-exam-candidates": "명",
  "stale-candidates": "명",
  "training-needed": "명",
  "guarantee-needed": "건",
  "monthly-proposal-staff": "명",
  "inactive-staff": "명",
  "active-staff": "명",
};

function candidateExamLine(row, includeConsult = true) {
  const items = [row.시험구분 || "시험", row.희망시험일자 || "-"];
  if (includeConsult) items.push(`최근상담 ${row.최근상담일자 || "없음"}`);
  if (row.합격예상) items.push(`합격예상 ${row.합격예상}`);
  if (row.시험지역) items.push(`시험지역 ${row.시험지역}`);
  if (row.시험일시) items.push(`시험일시 ${row.시험일시}`);
  return items.join(" / ");
}

function shortExamDateTime(value) {
  const text = String(value || "").trim();
  const match = text.match(/^20(\d{2}-\d{2}-\d{2})(.*)$/);
  return match ? `${match[1]}${match[2]}` : text;
}

function dashboardMapperForTarget(target) {
  if (target === "unpaid-premiums") {
    return (row, index) => ({
      titleHtml: `${badge(row.미입금처리상태 || row.구분 || "미입금")} <span class="name-token">${escapeHtml(personLabel(row.파트너스명, "P"))}</span> <span class="muted">/</span> <span class="name-token">${escapeHtml(row.계약자명 || "")}</span>`,
      detail: `대상 ${row.대상회차 || "-"}회차 / 유지 ${row.계약유지회차 || "-"}회차 / 집금책임액 ${money(row.집금책임액 || 0)}원 / ${compactText(row.상품명, 80)}`,
      action: "staff-detail-home",
      key: String(index),
    });
  }
  if (["retouch", "urgent-retouch"].includes(target)) {
    return (row, index) => ({
      titleHtml: `${badge(row.재터치우선순위 || row.진행단계 || "확인")} <span class="name-token">${escapeHtml(personLabel(row.지점원, "P"))}</span> <span class="muted">/</span> <span class="name-token">${escapeHtml(row.고객 || "")}</span>`,
      detail: `${row["상품/내용"] || "-"} / ${row.진행단계 || "-"} / ${row.경과일수 || "0"}일 경과`,
      action: "contract-detail",
      key: String(index),
    });
  }
  if (["upcoming-exam-candidates", "stale-candidates", "training-needed"].includes(target)) {
    return (row, index) => ({
      titleHtml: `${badge(row.후보진행 || "상태 없음")} <span class="name-token">${escapeHtml(row.성명 || "")}</span> <span class="muted">/</span> <span>${escapeHtml(row.배양코드 || "")}</span>`,
      detail:
        target === "upcoming-exam-candidates"
          ? candidateExamLine(row)
          : `${row.경과일수 || "0"}일 경과 / 최근상담 ${row.최근상담일자 || "없음"} / ${compactText(row.최근상담내용, 90)}`,
      action: target === "training-needed" ? "training-detail" : "candidate-detail",
      key: String(index),
    });
  }
  return (row, index) => ({
    titleHtml: `${badge(row.이행보증상태 || row.표시상태 || "활동")} <span class="name-token">${escapeHtml(personLabel(row.지점원 || row.성명, "P"))}</span>`,
    detail: row.제안건수
      ? `제안 ${money(row.제안건수)}건 / 고객 ${money(row.고객수 || 0)}명 / 최근 ${row.최근제안일 || "-"} / ${compactText(row.고객목록 || row.상품목록, 80)}`
      : row.누적계약건수
      ? `누적 ${money(row.누적계약건수 || 0)}건 / 매출 ${money(row.누적매출금액 || 0)} / 계약월 ${row.계약월목록 || row.최근계약시트 || "-"}`
      : `${row.신입경력 || "-"} / ${row.차월 || "-"}차월 / 최근계약 ${row.최근계약시트 || "없음"}`,
    action: target === "guarantee-needed" ? "guarantee-detail" : "staff-detail-home",
    key: String(index),
  });
}

function renderDashboardFocusRows() {
  const query = document.getElementById("dashboardFocusSearch").value.trim().toLowerCase();
  const rows = state.dashboardFocusRows.filter((row) => {
    if (!query) return true;
    return Object.values(row).some((value) => String(value || "").toLowerCase().includes(query));
  });
  const [title] = dashboardTargetTitles[state.dashboardFocus] || ["대상 목록"];
  const unit = dashboardTargetUnits[state.dashboardFocus] || "건";
  window.dashboardFocusRows = rows;
  document.getElementById("dashboardFocusTitle").textContent = `${title} · ${money(rows.length)}${unit}`;
  if (state.dashboardFocus === "unpaid-premiums") {
    renderUnpaidFocusRows(rows);
    return;
  }
  renderCompactList("dashboardFocusList", rows, dashboardMapperForTarget(state.dashboardFocus));
}

async function renderDashboardFocus(target) {
  const focus = document.getElementById("dashboardFocus");
  const lanes = document.getElementById("dashboardLanes");
  if (!target) {
    focus.classList.add("hidden");
    lanes.classList.remove("hidden");
    state.dashboardFocusRows = [];
    document.getElementById("dashboardFocusSearch").value = "";
    return;
  }

  const rows = await getJson(`${endpoints.dashboardTargets}?target=${encodeURIComponent(target)}&limit=2000`);
  const [title, subtitle] = dashboardTargetTitles[target] || ["대상 목록", "선택한 항목의 대상자입니다."];
  const unit = dashboardTargetUnits[target] || "건";
  state.dashboardFocus = target;
  state.dashboardFocusRows = rows;
  window.dashboardFocusRows = rows;
  document.getElementById("dashboardFocusSearch").value = "";
  document.getElementById("dashboardFocusTitle").textContent = `${title} · ${money(rows.length)}${unit}`;
  document.getElementById("dashboardFocusSubtitle").textContent = subtitle;
  renderDashboardFocusRows();
  lanes.classList.add("hidden");
  focus.classList.remove("hidden");
}

async function loadDashboard() {
  const data = await getJson(endpoints.summary);
  const counts = data.counts || {};
  const top = data.top || {};
  const retouchRows = top.retouch || [];
  const upcomingCandidateRows = top.upcoming_exam_candidates || [];
  const trainingRows = top.training_needed || [];
  const guaranteeRows = top.guarantee_needed || [];
  const monthlyProposalStaffRows = top.monthly_proposal_staff || [];
  const urgentRetouch = Number(data.retouch_priority?.["긴급"] || 0);
  const totalRetouch = countValue(counts, "계약 재터치 대상") || retouchRows.length;
  const upcomingCandidates = countValue(counts, "다음 시험 예정자") || upcomingCandidateRows.length;
  const trainingNeeded = countValue(counts, "보험연수원 안내 필요") || trainingRows.length;
  const guaranteeNeeded = countValue(counts, "이행보증 현황") || guaranteeRows.length;
  const monthlyProposalStaff = countValue(counts, "해당월 제안 지점원") || monthlyProposalStaffRows.length;
  const isEducationRole = state.role === "education";

  const examWindow = data.candidate_exam_window || {};
  const examLabel = [examWindow.month, examWindow.group].filter(Boolean).join(" ");

  document.getElementById("dashboardNarrative").textContent = isEducationRole
    ? `후보자 ${money(data.candidate_total || 0)}명 중 ${examLabel || "다음 시험"} 예정자 ${money(upcomingCandidates)}명, 교육 안내 필요 ${money(trainingNeeded)}명입니다.`
    : `오늘 확인할 계약 재터치 ${money(totalRetouch)}건 중 긴급 ${money(urgentRetouch)}건이 있습니다. ` +
      `후보자 ${money(data.candidate_total || 0)}명 중 ${examLabel || "다음 시험"} 예정자 ${money(upcomingCandidates)}명, 교육 안내 필요 ${money(trainingNeeded)}명입니다.`;
  renderPriorityStrip(
    isEducationRole
      ? [
          { label: "다음 시험 예정자", value: `${money(upcomingCandidates)}명`, tone: upcomingCandidates ? "warn" : "", target: "upcoming-exam-candidates" },
          { label: "교육 안내", value: `${money(trainingNeeded)}명`, target: "training-needed" },
        ]
      : [
          { label: "긴급 재터치", value: `${money(urgentRetouch)}건`, tone: urgentRetouch ? "danger" : "", target: "urgent-retouch" },
          { label: "다음 시험 예정자", value: `${money(upcomingCandidates)}명`, tone: upcomingCandidates ? "warn" : "", target: "upcoming-exam-candidates" },
          { label: "교육 안내", value: `${money(trainingNeeded)}명`, target: "training-needed" },
          { label: "이행보증 현황", value: `${money(guaranteeNeeded)}건`, target: "guarantee-needed" },
        ],
  );

  const metricLabels = isEducationRole
    ? ["다음 시험 예정자", "보험연수원 안내 필요"]
    : [
        "계약 재터치 대상",
        "다음 시험 예정자",
        "보험연수원 안내 필요",
        "이행보증 현황",
        "미입금 확인",
        "해당월 제안 지점원",
        "활동 지점원",
      ];
  const cards = metricLabels
    .filter((label) => Object.prototype.hasOwnProperty.call(counts, label))
    .map((label) => {
      const target = metricTargetByLabel[label] || "";
      return `<article class="metric ${target ? "clickable" : ""}" ${target ? `data-dashboard-target="${escapeHtml(target)}"` : ""}><strong>${money(counts[label])}</strong><span>${escapeHtml(label)}</span></article>`;
    })
    .join("");
  document.getElementById("summaryCards").innerHTML = cards;
  document.getElementById("homeCandidateTotal").textContent = `전체 ${money(data.candidate_total || 0)}명`;
  document.getElementById("retouchUrgencyLabel").textContent = `긴급 ${money(urgentRetouch)}건 / 전체 ${money(totalRetouch)}건`;
  document.getElementById("guaranteeLabel").textContent = `${money(guaranteeNeeded)}건`;
  document.getElementById("trainingLabel").textContent = `${money(trainingNeeded)}명`;
  document.getElementById("staleCandidateLabel").textContent = `${examLabel ? `${examLabel} · ` : ""}${money(upcomingCandidates)}명`;
  document.getElementById("inactiveStaffLabel").textContent = `${money(monthlyProposalStaff)}명`;

  window.homeRetouchRows = retouchRows;
  window.homeCandidateRows = upcomingCandidateRows;
  window.homeTrainingRows = trainingRows;
  window.homeGuaranteeRows = guaranteeRows;
  window.homeStaffRows = monthlyProposalStaffRows;

  renderCompactList("homeRetouch", retouchRows, (row, index) => ({
    titleHtml: `${badge(row.재터치우선순위)} <span class="name-token">${escapeHtml(personLabel(row.지점원, "P"))}</span> <span class="muted">/</span> <span class="name-token">${escapeHtml(row.고객)}</span>`,
    detail: `${row["상품/내용"]} / ${row.진행단계} / ${row.경과일수}일 경과`,
    action: "contract-detail",
    key: String(index),
  }));

  renderCompactList("homeGuarantee", guaranteeRows, (row, index) => ({
    titleHtml: `${badge(row.이행보증상태 || "요청")} <span class="name-token">${escapeHtml(personLabel(row.지점원 || row.성명, "P"))}</span>`,
    detail: `금액 ${row.이행보증금액 || "-"} / ${row.이행보증메모 ? compactText(row.이행보증메모, 50) : "메모 없음"} / ${row.이행보증처리일시 || "-"}`,
    action: "guarantee-detail",
    key: String(index),
  }));

  renderCompactList("homeTraining", trainingRows, (row, index) => ({
    titleHtml: `${badge(row.후보진행 || "교육 안내")} <span class="name-token">${escapeHtml(row.성명)}</span> <span class="muted">/</span> <span>${escapeHtml(row.배양코드 || "")}</span>`,
    detail: `${row.합격여부 || "합격 확인"} / 최근상담 ${row.최근상담일자 || "없음"} / ${compactText(row.최근상담내용, 70)}`,
    action: "training-detail",
    key: String(index),
  }));

  renderCompactList("homeCandidates", upcomingCandidateRows, (row, index) => ({
    titleHtml: `${badge(row.후보진행 || "상태 없음")} <span class="name-token">${escapeHtml(row.성명)}</span> <span class="muted">/</span> <span>${escapeHtml(row.배양코드 || "")}</span>`,
    detail: `${candidateExamLine(row)} / ${compactText(row.최근상담내용, 70)}`,
    action: "candidate-detail",
    key: String(index),
  }));

  renderCompactList("homeStaff", monthlyProposalStaffRows, (row, index) => ({
    titleHtml: `${badge("제안")} <span class="name-token">${escapeHtml(personLabel(row.지점원 || row.성명, "P"))}</span>`,
    detail: `제안 ${money(row.제안건수 || 0)}건 / 고객 ${money(row.고객수 || 0)}명 / 최근 ${row.최근제안일 || "-"} / ${compactText(row.고객목록 || row.상품목록, 70)}`,
    action: "staff-detail-home",
    key: String(index),
  }));

  if (state.dashboardFocus) {
    await renderDashboardFocus(state.dashboardFocus);
  }
}

async function loadCandidates() {
  await ensureCandidateSummaryData();
  setupCandidateFilters();

  const query = document.getElementById("candidateSearch").value.trim().toLowerCase();
  const status = document.getElementById("candidateStatusFilter").value;
  const pass = document.getElementById("candidatePassFilter").value;
  const appoint = document.getElementById("candidateAppointFilter").value;
  const baseRows = candidateManagementRows();
  const rows = baseRows.filter((row) => {
    const matchesQuery = !query || Object.values(row).some((value) => String(value || "").toLowerCase().includes(query));
    return (
      matchesQuery &&
      (!status || row.후보진행 === status) &&
      (!pass || row.합격여부 === pass) &&
      (!appoint || row.위촉여부 === appoint) &&
      (!state.candidateStaleOnly || isStaleCandidate(row))
    );
  });

  const displayRows = narrowCandidateRowsForDetail(rows, query);
  document.getElementById("candidateTotalBadge").textContent = `전체 후보자 ${money(baseRows.length)}명 · 표시 ${money(displayRows.length)}명`;
  renderCandidateRows(displayRows);

  if (query && displayRows.length) {
    await showCandidateDetail(displayRows[0]);
  } else if (!query) {
    document.getElementById("candidateDetail").classList.add("hidden");
  }
}

async function ensureCandidateSummaryData() {
  if (!state.candidateRows.length) {
    state.candidateRows = await getJson(`${endpoints.candidates}?limit=2000`);
  }
}

async function ensureCandidateDetailData() {
  if (!state.candidateDetailRows.length) {
    state.candidateDetailRows = await getJson(`${endpoints.candidateDetail}?limit=2000`);
  }
}

async function ensureCandidateData() {
  await ensureCandidateSummaryData();
  await ensureCandidateDetailData();
}

function setupCandidateFilters() {
  if (state.candidateFiltersReady) return;
  const rows = candidateManagementRows();
  fillFilterSelect("candidateStatusFilter", rows.map((row) => row.후보진행), "전체 진행");
  fillFilterSelect("candidatePassFilter", rows.map((row) => row.합격여부), "전체 합격");
  fillFilterSelect("candidateAppointFilter", rows.map((row) => row.위촉여부), "전체 위촉");
  state.candidateFiltersReady = true;
}

function fillFilterSelect(id, values, allLabel) {
  const select = document.getElementById(id);
  const unique = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ko-KR", { numeric: true }),
  );
  select.innerHTML = [`<option value="">${escapeHtml(allLabel)}</option>`]
    .concat(unique.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`))
    .join("");
}

function setCandidateScheduleOpen(open) {
  state.candidateScheduleOpen = open;
  document.getElementById("candidateSchedulePanel").classList.toggle("hidden", !open);
  document.getElementById("candidateScheduleToggle").classList.toggle("active", open);
}

async function ensureContractData() {
  if (!state.contractRows.length) {
    state.contractRows = await getJson(`${endpoints.contracts}?limit=2000`);
  }
}

function findCandidateByName(name) {
  const cleanName = String(name || "")
    .replace(/P$/i, "")
    .replace(/님$/, "")
    .trim();
  return (
    state.candidateRows.find((row) => row.성명 === cleanName) ||
    state.candidateRows.find((row) => String(row.성명 || "").includes(cleanName)) ||
    {}
  );
}

function candidateConsultationTable(code, fallbackHistory, manualNote = {}) {
  const rows = state.candidateDetailRows
    .filter((row) => String(row.배양코드 || "") === String(code || ""))
    .sort((a, b) => compareValues(b.상담일자, a.상담일자));

  const manualRow = manualNote.note
    ? [
        {
          상담일자: manualNote.updated_at || "수기",
          상담진행: "수기 메모",
          통화: "-",
          발송: "-",
          상담내용: manualNote.note,
        },
      ]
    : [];
  const tableRows = manualRow.concat(rows);

  if (!tableRows.length) return consultationTable(fallbackHistory);
  return `
    <div class="table-wrap detail-table-wrap">
      <table class="history-table candidate-history-table">
        <thead><tr><th>날짜</th><th>진행</th><th>통화</th><th>발송</th><th>상담 내용</th></tr></thead>
        <tbody>
          ${tableRows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(row.상담일자 || "-")}</td>
                  <td>${escapeHtml(row.상담진행 || row.후보진행 || "-")}</td>
                  <td>${escapeHtml(row.통화 || "-")}</td>
                  <td>${escapeHtml(row.발송 || "-")}</td>
                  <td>${escapeHtml(row.상담내용 || "")}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function quickDocumentLinks(files) {
  const list = splitFiles(files);
  if (!list.length) return `<div class="muted">연결된 제안서/서류가 없습니다.</div>`;
  return `
    <div class="quick-doc-list">
      ${list
        .map((file) => {
          const link = `/file?path=${encodeURIComponent(file)}`;
          return `<a class="doc-link" href="${link}" target="_blank" rel="noopener">${escapeHtml(fileStem(file))}</a>`;
        })
        .join("")}
    </div>
  `;
}

function isClosedContractRow(row) {
  const status = String(row.진행단계 || "");
  const docType = String(row.문서종류 || "");
  if (status.includes("미청약")) return false;
  return status.includes("청약") || docType.includes("청약") || status.includes("체결");
}

function customerContractCard(row) {
  return `
    <section class="customer-contract">
      <div class="contract-line">
        <strong>${escapeHtml(row["상품/내용"] || "상품 미분류")}</strong>
        ${badge(row.진행단계 || "상태 없음")}
        <span class="muted">${escapeHtml(row.최신수정일 || "")}</span>
      </div>
      ${quickDocumentLinks(row.파일목록)}
    </section>
  `;
}

function staffEditPanel(staff, agentName, panelId) {
  return `
    <section class="staff-edit-panel">
      <div class="retouch-action-header">
        <div>
          <strong>지점원 정보 수정</strong>
          <span>수정값은 별도 저장되며 원본 엑셀은 바꾸지 않습니다.</span>
        </div>
        <span id="staffOverrideStatus" class="muted"></span>
      </div>
      <div class="staff-edit-grid">
        <label class="field">
          <span>상태</span>
          <input id="staffEditStatus" value="${escapeHtml(staff.표시상태 || "")}" />
        </label>
        <label class="field">
          <span>구분</span>
          <input id="staffEditCareer" value="${escapeHtml(staff.신입경력 || "")}" />
        </label>
        <label class="field">
          <span>차월</span>
          <input id="staffEditMonth" value="${escapeHtml(staff.차월 || "")}" />
        </label>
        <label class="field">
          <span>연락처</span>
          <input id="staffEditPhone" value="${escapeHtml(staff.휴대폰 || "")}" />
        </label>
        <label class="field">
          <span>위촉코드</span>
          <input id="staffEditCode" value="${escapeHtml(staff.위촉코드 || "")}" />
        </label>
      </div>
      <button id="saveStaffOverride" class="primary-button small-button" data-agent="${escapeHtml(agentName)}" data-panel-id="${escapeHtml(panelId)}">수정 내용 저장</button>
    </section>
  `;
}

function contractColumn(title, rows, emptyText) {
  return `
    <div class="contract-column">
      <h5>${escapeHtml(title)} <span>${money(rows.length)}건</span></h5>
      ${
        rows.length
          ? rows.map(customerContractCard).join("")
          : `<div class="muted contract-empty">${escapeHtml(emptyText)}</div>`
      }
    </div>
  `;
}

async function staffContractsByCustomer(agentName) {
  await ensureContractData();
  const rows = state.contractRows.filter((row) => row.지점원 === agentName);
  const summaryRows = await getJson(`${endpoints.staffSummary}?q=${encodeURIComponent(agentName)}&limit=1`);
  const summary = summaryRows[0] || {};
  const totalContracts = Number(String(summary.누적계약건수 || "0").replaceAll(",", ""));
  const totalSales = summary.누적매출금액 || "0";
  const closedDocRows = rows.filter(isClosedContractRow);
  const missingClosedCount = Math.max(0, totalContracts - closedDocRows.length);
  const missingClosedHtml = missingClosedCount
    ? `
      <section class="customer-group no-doc-contracts">
        <h4>서류 없는 체결 계약</h4>
        <div class="detail-grid compact-detail-grid">
          <div class="detail-stat"><span>계약 건수</span><strong>${money(missingClosedCount)}건</strong></div>
          <div class="detail-stat"><span>누적 매출</span><strong>${money(totalSales)}</strong></div>
          <div class="detail-stat"><span>확인 기준</span><strong>계약 시트</strong></div>
        </div>
      </section>
    `
    : "";
  if (!rows.length) {
    return missingClosedHtml || `<div class="muted">연결된 계약/서류 내역이 없습니다.</div>`;
  }

  const grouped = rows.reduce((acc, row) => {
    const customer = row.고객 || "고객 미분류";
    if (!acc[customer]) acc[customer] = [];
    acc[customer].push(row);
    return acc;
  }, {});

  const sections = [];
  for (const [customer, customerRows] of Object.entries(grouped)) {
    const closedRows = customerRows.filter(isClosedContractRow);
    const proposalRows = customerRows.filter((row) => !isClosedContractRow(row));
    sections.push(`
      <section class="customer-group">
        <h4>${escapeHtml(customer)}</h4>
        <div class="contract-split">
          ${contractColumn("제안", proposalRows, "제안 서류가 없습니다.")}
          ${contractColumn("체결/청약 서류", closedRows, "체결 또는 청약 서류가 없습니다.")}
        </div>
      </section>
    `);
  }
  return `<div class="customer-groups">${missingClosedHtml}${sections.join("")}</div>`;
}

async function showStaffDetailByName(agentName, panelId = "staffDetail") {
  await ensureCandidateSummaryData();
  const panel = document.getElementById(panelId);
  const staffRows = await getJson(`${endpoints.staff}?q=${encodeURIComponent(agentName)}&limit=10`);
  const staff = staffRows.find((row) => row.성명 === agentName) || staffRows[0] || {};
  const resolvedAgentName = staff.성명 || agentName;
  const candidate = findCandidateByName(resolvedAgentName);
  const manualNoteKey = candidate.배양코드 || `staff:${resolvedAgentName}`;
  const [manualNote, guaranteeNotice, unpaidRows, partnerRetouchHistory] = await Promise.all([
    getManualNote(manualNoteKey),
    getJson(`${endpoints.guaranteeNotice}?agent=${encodeURIComponent(agentName)}`),
    getJson(`${endpoints.unpaidNotice}?agent=${encodeURIComponent(agentName)}`),
    getJson(`${endpoints.retouchHistory}?agent=${encodeURIComponent(agentName)}`),
  ]);

  if (panelId === "staffDetail" && staff.성명) {
    document.getElementById("staffSearch").value = resolvedAgentName;
    document.getElementById("staffTable").innerHTML = "";
  }

  state.activeCandidateRow = null;
  state.manualNoteTarget = { type: "staff", agent: resolvedAgentName, panelId };
  panel.classList.remove("hidden");
  const backTarget = state.detailBack ? "previous" : panelId === "contractDetail" ? "contracts" : "staff";
  panel.innerHTML = `
    ${detailHeading(`지점원 상세 · ${escapeHtml(resolvedAgentName)}`, backTarget)}
    <div class="detail-grid staff-detail-grid">
      <div class="detail-stat"><span>상태</span><strong>${escapeHtml(staff.표시상태 || "-")}</strong></div>
      <div class="detail-stat"><span>구분/차월</span><strong>${escapeHtml(staff.신입경력 || "-")} / ${escapeHtml(staff.차월 || "-")}</strong></div>
      <div class="detail-stat"><span>연락처</span><strong>${escapeHtml(staff.휴대폰 || "-")}</strong></div>
      <div class="detail-stat"><span>위촉코드</span><strong>${escapeHtml(staff.위촉코드 || "-")}</strong></div>
      <div class="detail-stat"><span>후보 배양코드</span><strong>${escapeHtml(candidate.배양코드 || "-")}</strong></div>
    </div>
    ${staffEditPanel(staff, resolvedAgentName, panelId)}
    ${guaranteeNoticePanel(agentName, guaranteeNotice)}
    ${unpaidNoticePanel(unpaidRows)}
    ${manualNotePanel(manualNoteKey, manualNote, "지점원 상담현황에 없는 마지막 연락 내용이나 관리 메모를 적어두세요.")}
    <div>
      <strong>파트너스 재터치 기록</strong>
      ${partnerRetouchHistoryTable(partnerRetouchHistory)}
    </div>
    ${lazyStaffSection("상담내용", "consultation", resolvedAgentName, candidate.배양코드 || "")}
    ${lazyStaffSection("고객별 계약/서류", "contracts", resolvedAgentName)}
  `;
}

async function getManualNote(code) {
  try {
    return await getJson(`${endpoints.manualNote}?code=${encodeURIComponent(code || "")}`);
  } catch (error) {
    return { note: "", updated_at: "" };
  }
}

async function showCandidateDetail(row) {
  await ensureCandidateData();
  const panel = document.getElementById("candidateDetail");
  const manualNote = await getManualNote(row.배양코드);
  state.activeCandidateRow = row;
  state.manualNoteTarget = { type: "candidate", row };
  document.getElementById("candidateSearch").value = row.배양코드 || row.성명 || "";
  renderCandidateRows([row]);
  document.getElementById("candidateTotalBadge").textContent = `전체 후보자 ${money(candidateManagementRows().length)}명 · 표시 1명`;
  panel.classList.remove("hidden");
  const backTarget = state.detailBack ? "previous" : "candidates";
  panel.innerHTML = `
    ${detailHeading(`상담내용 화면 · ${escapeHtml(row.성명 || "")}`, backTarget)}
    <div class="detail-grid">
      <div class="detail-stat"><span>배정일자</span><strong>${escapeHtml(row.배정일자 || "-")}</strong></div>
      <div class="detail-stat"><span>배양코드</span><strong>${escapeHtml(row.배양코드 || "")}</strong></div>
      <div class="detail-stat"><span>후보 진행</span><strong>${escapeHtml(row.후보진행 || "미분류")}</strong></div>
      <div class="detail-stat"><span>합격/위촉</span><strong>${escapeHtml(row.합격여부 || "-")} / ${escapeHtml(row.위촉여부 || "-")}</strong></div>
      <div class="detail-stat"><span>희망시험일자</span><strong>${escapeHtml(row.희망시험일자 || "-")}</strong></div>
      <div class="detail-stat"><span>경과일수</span><strong>${escapeHtml(row.경과일수 || "0")}일</strong></div>
      <div class="detail-stat"><span>합격예상</span><strong>${escapeHtml(row.합격예상 || "-")}</strong></div>
      <div class="detail-stat"><span>시험지역</span><strong>${escapeHtml(row.시험지역 || "-")}</strong></div>
      <div class="detail-stat"><span>시험일시</span><strong>${escapeHtml(shortExamDateTime(row.시험일시) || "-")}</strong></div>
    </div>
    ${manualNotePanel(row.배양코드 || "", manualNote, "상담현황에 없는 마지막 연락 내용이나 다음 액션을 적어두세요.")}
    <div class="detail-text"><strong>최근 상담</strong><br>${escapeHtml(row.최근상담내용 || "")}</div>
    <div>
      <strong>상담 이력</strong>
      ${candidateConsultationTable(row.배양코드, row.상담이력, manualNote)}
    </div>
  `;
}

async function loadStaff() {
  const query = encodeURIComponent(document.getElementById("staffSearch").value);
  const rows = await getJson(`${endpoints.staff}?q=${query}&limit=500`);
  renderStaffRows(rows);
}

async function loadContracts() {
  const query = encodeURIComponent(document.getElementById("contractSearch").value);
  const status = encodeURIComponent(state.contractStatus);
  const rows = await getJson(`${endpoints.retouch}?q=${query}&status=${status}&limit=500`);
  renderTable("contractTable", rows, [
    { key: "재터치우선순위", label: "우선순위", badge: true },
    { key: "지점원", label: "지점원", max: 20 },
    { key: "고객", label: "고객", max: 24 },
    { key: "상품/내용", label: "상품/내용", max: 45 },
    { key: "전략상품구분", label: "전략구분", badge: true },
    { key: "진행단계", label: "진행단계", badge: true },
    { key: "경과일수", label: "경과", max: 10 },
    { key: "최신수정일", label: "최신수정일", max: 20 },
  ], { rowAction: "contract-staff-detail" });
}

function money(value) {
  const numeric = Number(String(value || "0").replaceAll(",", ""));
  if (!Number.isFinite(numeric)) return value || "0";
  return numeric.toLocaleString("ko-KR");
}

function splitFiles(files) {
  return String(files || "")
    .split(" | ")
    .filter(Boolean)
    .map((file) => file.trim());
}

function fileStem(file) {
  const filename = String(file || "").replaceAll("\\", "/").split("/").pop() || "";
  return filename.replace(/\.[^.]+$/, "");
}

function consultationRows(history) {
  const text = String(history || "").trim();
  if (!text) return [];
  const pattern = /(\d{4}[-.]\d{2}[-.]\d{2})([\s\S]*?)(?=\s+\/\s+\d{4}[-.]\d{2}[-.]\d{2}|\n+\d{4}[-.]\d{2}[-.]\d{2}|$)/g;
  const rows = [...text.matchAll(pattern)].map((match) => ({
    date: match[1],
    content: match[2].replace(/^[:\s-]+/, "").replace(/\s+\/\s*$/, "").trim(),
  }));
  if (rows.length) return rows;
  return text.split(" / ").filter(Boolean).map((content) => ({ date: "-", content: content.trim() }));
}

function consultationTable(history, emptyText = "상담 이력이 없습니다.") {
  const rows = consultationRows(history);
  if (!rows.length) return `<div class="muted">${escapeHtml(emptyText)}</div>`;
  return `
    <div class="table-wrap detail-table-wrap">
      <table class="history-table">
        <thead><tr><th>날짜</th><th>상담 내용</th></tr></thead>
        <tbody>
          ${rows
            .map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.content)}</td></tr>`)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function documentTable(files) {
  const list = splitFiles(files);
  if (!list.length) return `<div class="muted">연결된 제안서/서류가 없습니다.</div>`;
  const infos = await Promise.all(
    list.map(async (file) => {
      try {
        return await getJson(`${endpoints.docInfo}?path=${encodeURIComponent(file)}`);
      } catch (error) {
        return {
          path: file,
          label: fileStem(file),
          product: "확인 필요",
          premium: "확인 필요",
          term: "확인 필요",
        };
      }
    }),
  );
  return `
    <div class="table-wrap detail-table-wrap">
      <table class="doc-table">
        <thead><tr><th>서류</th><th>상품명</th><th>보험료</th><th>납입기간</th></tr></thead>
        <tbody>
          ${infos
            .map((info) => {
              const path = info.path || "";
              const link = `/file?path=${encodeURIComponent(path)}`;
              return `
                <tr>
                  <td><a class="doc-link" href="${link}" target="_blank" rel="noopener">${escapeHtml(info.label || fileStem(path))}</a></td>
                  <td>${escapeHtml(info.product || "확인 필요")}</td>
                  <td>${escapeHtml(info.premium || "확인 필요")}</td>
                  <td>${escapeHtml(info.term || "확인 필요")}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function partnerRetouchHistoryTable(rows) {
  if (!rows || !rows.length) {
    return `<div class="muted">저장된 파트너스 재터치 기록이 없습니다.</div>`;
  }
  return `
    <div class="table-wrap detail-table-wrap">
      <table class="history-table partner-retouch-table">
        <thead><tr><th>기록일</th><th>터치 이름</th><th>재터치 내용</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${escapeHtml(row.기록일 || "-")}</td>
                  <td>${escapeHtml(row.터치이름 || "-")}</td>
                  <td>${escapeHtml(row.재터치내용 || "")}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function showContractDetail(row) {
  await ensureCandidateData();
  const panel = document.getElementById("contractDetail");
  const staffQuery = encodeURIComponent(row.지점원 || "");
  const staffRows = await getJson(`${endpoints.staffSummary}?q=${staffQuery}&limit=1`);
  const staff = staffRows[0] || {};
  const staffDetailRows = await getJson(`${endpoints.staff}?q=${staffQuery}&limit=10`);
  const staffDetail = staffDetailRows.find((item) => item.성명 === row.지점원) || staffDetailRows[0] || {};
  const candidate = findCandidateByName(row.지점원);
  const manualNote = await getManualNote(candidate.배양코드);
  const documents = await documentTable(row.파일목록);
  const partnerRetouchHistory = await getJson(`${endpoints.retouchHistory}?agent=${staffQuery}`);
  const recentTouchDate = candidate.최종터치일자 || candidate.최근상담일자 || "-";
  state.activeContractRow = row;
  panel.classList.remove("hidden");
  const backTarget = state.detailBack ? "previous" : "contracts";
  panel.innerHTML = `
    ${detailHeading(`계약 재터치 상세 · ${badge(row.재터치우선순위)} ${escapeHtml(personLabel(row.지점원, "P"))} / ${escapeHtml(row.고객 || "")}`, backTarget)}
    <div class="partner-meta">
      <span>${escapeHtml(personLabel(row.지점원, "P"))}의 사번 <strong>${escapeHtml(staffDetail.위촉코드 || "-")}</strong></span>
      <span>연락처 <strong>${escapeHtml(staffDetail.휴대폰 || "-")}</strong></span>
      <span>최근 터치일 <strong>${escapeHtml(recentTouchDate)}</strong></span>
    </div>
    <div class="detail-grid">
      <div class="detail-stat"><span>상품/내용</span><strong>${escapeHtml(row["상품/내용"] || "")}</strong></div>
      <div class="detail-stat"><span>진행단계</span><strong>${escapeHtml(row.진행단계 || "")}</strong></div>
      <div class="detail-stat"><span>경과일수</span><strong>${escapeHtml(row.경과일수 || "0")}일</strong></div>
      <div class="detail-stat"><span>전략상품 구분</span><strong>${escapeHtml(row.전략상품구분 || "")}</strong></div>
      <div class="detail-stat"><span>지금까지 계약 건수</span><strong>${money(staff.누적계약건수 || staff.당월계약건수)}건</strong></div>
      <div class="detail-stat"><span>지금까지 매출 금액</span><strong>${money(staff.누적매출금액 || staff.당월매출금액)}</strong></div>
      <div class="detail-stat"><span>최근 계약월</span><strong>${escapeHtml(staff.최근계약시트 || "-")}</strong></div>
      <div class="detail-stat"><span>계약월 목록</span><strong>${escapeHtml(staff.계약월목록 || "-")}</strong></div>
    </div>
    ${retouchActionPanel(row)}
    <div>
      <strong>제안한 계약서/서류</strong>
      ${documents}
    </div>
    <div>
      <strong>파트너스 재터치 기록</strong>
      ${partnerRetouchHistoryTable(partnerRetouchHistory)}
    </div>
    <div>
      <strong>상담내용 화면</strong>
      ${candidate.배양코드 ? candidateConsultationTable(candidate.배양코드, candidate.상담이력, manualNote) : `<div class="muted">연결된 후보자 상담 이력이 없습니다.</div>`}
    </div>
  `;
}

async function openCandidateFromHome(index) {
  const row = window.homeCandidateRows?.[Number(index)];
  if (!row) return;
  state.detailBack = { page: "dashboard", focus: "" };
  document.getElementById("candidateSearch").value = row.배양코드 || row.성명 || "";
  showPage("candidates");
  await showCandidateDetail(row);
}

async function openTrainingFromHome(index) {
  const row = window.homeTrainingRows?.[Number(index)];
  if (!row) return;
  state.detailBack = { page: "dashboard", focus: "" };
  document.getElementById("candidateSearch").value = row.배양코드 || row.성명 || "";
  showPage("candidates");
  await showCandidateDetail(row);
}

async function openContractFromHome(index) {
  const row = window.homeRetouchRows?.[Number(index)];
  if (!row) return;
  state.detailBack = { page: "dashboard", focus: "" };
  document.getElementById("contractSearch").value = `${row.지점원 || ""} ${row.고객 || ""}`.trim();
  state.contractStatus = "";
  document.querySelectorAll("[data-contract-status]").forEach((item) => item.classList.remove("active"));
  document.querySelector('[data-contract-status=""]').classList.add("active");
  showPage("contracts");
  await showContractDetail(row);
}

async function openGuaranteeFromHome(index) {
  const row = window.homeGuaranteeRows?.[Number(index)];
  if (!row) return;
  state.detailBack = { page: "dashboard", focus: "" };
  const agentName = row.지점원 || row.성명 || "";
  document.getElementById("staffSearch").value = agentName;
  showPage("staff");
  await showStaffDetailByName(agentName, "staffDetail");
}

async function openStaffFromHome(index) {
  const row = window.homeStaffRows?.[Number(index)];
  if (!row) return;
  state.detailBack = { page: "dashboard", focus: "" };
  const agentName = row.지점원 || row.성명 || "";
  document.getElementById("staffSearch").value = agentName;
  showPage("staff");
  await showStaffDetailByName(agentName, "staffDetail");
}

async function openDashboardFocusItem(action, index) {
  const row = window.dashboardFocusRows?.[Number(index)];
  if (!row) return;
  state.detailBack = { page: "dashboard", focus: state.dashboardFocus };
  if (action === "contract-detail") {
    document.getElementById("contractSearch").value = `${row.지점원 || ""} ${row.고객 || ""}`.trim();
    state.contractStatus = "";
    document.querySelectorAll("[data-contract-status]").forEach((item) => item.classList.remove("active"));
    document.querySelector('[data-contract-status=""]').classList.add("active");
    showPage("contracts");
    await showContractDetail(row);
    return;
  }
  if (action === "candidate-detail" || action === "training-detail") {
    document.getElementById("candidateSearch").value = row.배양코드 || row.성명 || "";
    showPage("candidates");
    await showCandidateDetail(row);
    return;
  }
  if (action === "guarantee-detail" || action === "staff-detail-home") {
    const agentName = row.지점원 || row.성명 || row.파트너스명 || "";
    document.getElementById("staffSearch").value = agentName;
    showPage("staff");
    await showStaffDetailByName(agentName, "staffDetail");
  }
}

function normalizeChatText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.,!?~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowValue(row, keys, fallback = "") {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}

function rowSearchText(row) {
  return normalizeChatText(Object.values(row || {}).join(" "));
}

function chatQueryTerms(query, removeIntentWords = false) {
  const basicNoise = new Set(["검색", "검색해줘", "찾아줘", "찾아", "보여줘", "불러줘", "관련", "내용", "정보", "전체", "전부", "다", "좀"]);
  const noise = new Set([
    ...basicNoise,
    "목록",
    "리스트",
    "대상",
    "다음",
    "시험",
    "예정자",
    "급한",
    "중",
    "계약",
    "서류",
    "후보자",
    "지점원",
    "파트너스",
    "재터치",
    "긴급",
    "장기",
    "미터치",
    "미계약",
    "교육",
    "보험연수원",
    "이행보증",
    "수수료",
    "미입금",
    "집금",
    "안내",
    "필요",
    "활동",
  ]);
  const terms = normalizeChatText(query).split(" ").filter(Boolean);
  const removable = removeIntentWords ? noise : basicNoise;
  return terms.filter((term) => !removable.has(term));
}

function rowMatchesTerms(row, terms) {
  if (!terms.length) return true;
  const text = rowSearchText(row);
  return terms.every((term) => text.includes(term));
}

function uniqRows(rows, keyBuilder) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = keyBuilder(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function chatIntentFor(query) {
  const q = normalizeChatText(query);
  if (!q) return null;
  if (q.includes("이행보증")) return { target: "guarantee-needed", title: "이행보증 현황", kind: "guarantee" };
  if (q.includes("시험") || q.includes("선행") || q.includes("정규") || q.includes("후속")) return { target: "upcoming-exam-candidates", title: "다음 시험 예정자", kind: "candidate" };
  if (q.includes("장기") && q.includes("미터치")) return { target: "stale-candidates", title: "장기 미터치 후보자", kind: "candidate" };
  if (q.includes("보험연수원") || q.includes("교육")) return { target: "training-needed", title: "교육 안내 필요 후보자", kind: "candidate" };
  if (q.includes("활동") && q.includes("지점원")) return { target: "active-staff", title: "활동 지점원", kind: "staff" };
  if (q.includes("장기") && (q.includes("미계약") || q.includes("지점원"))) return { target: "inactive-staff", title: "장기 미계약 지점원", kind: "staff" };
  if (q.includes("미입금") || q.includes("집금")) return { target: "unpaid-premiums", title: "미입금 확인", kind: "staff" };
  if (q.includes("긴급")) return { target: "urgent-retouch", title: "긴급 재터치", kind: "contract" };
  if (q.includes("재터치")) return { target: "retouch", title: "계약 재터치 대상", kind: "contract" };
  return null;
}

async function ensureChatData() {
  if (state.chatDataReady) return;
  await Promise.all([ensureCandidateData(), ensureContractData()]);
  const [staff, staffSummary, retouch] = await Promise.all([
    getJson(`${endpoints.staff}?limit=2000`),
    getJson(`${endpoints.staffSummary}?limit=2000`),
    getJson(`${endpoints.retouch}?include_hidden=1&limit=2000`),
  ]);
  state.chatData = {
    candidates: state.candidateRows,
    candidateDetails: state.candidateDetailRows,
    staff,
    staffSummary,
    contracts: state.contractRows,
    retouch,
  };
  state.chatDataReady = true;
}

function chatResultHtml(kind, row, title, detail) {
  const index = state.chatResults.length;
  state.chatResults.push({ kind, row });
  return `
    <button class="chat-result" type="button" data-chat-index="${index}">
      <strong>${title}</strong>
      <span>${escapeHtml(detail || "")}</span>
    </button>
  `;
}

function chatSectionHtml(title, rows, kind, formatter, limit = 8) {
  if (!rows.length) return "";
  const items = rows.slice(0, limit).map((row) => {
    const formatted = formatter(row);
    return chatResultHtml(kind, row, formatted.title, formatted.detail);
  });
  const more = rows.length > limit ? `<div class="muted">외 ${money(rows.length - limit)}건 더 있습니다. 검색어를 더 구체적으로 입력해 주세요.</div>` : "";
  return `<section class="chat-section"><h4>${escapeHtml(title)} · ${money(rows.length)}건</h4>${items.join("")}${more}</section>`;
}

function formatCandidateChat(row) {
  const name = rowValue(row, ["성명"], "이름 없음");
  const code = rowValue(row, ["배양코드"], "-");
  const status = rowValue(row, ["후보진행"], "상태 없음");
  const days = rowValue(row, ["경과일수"], "0");
  const recent = rowValue(row, ["최근상담일자"], "없음");
  const content = rowValue(row, ["최근상담내용"], "");
  return {
    title: `${badge(status)} <span class="name-token">${escapeHtml(name)}</span> <span class="muted">/ ${escapeHtml(code)}</span>`,
    detail: `${days}일 경과 / 최근상담 ${recent} / ${compactText(content, 90)}`,
  };
}

function formatStaffChat(row) {
  const name = rowValue(row, ["성명", "지점원", "파트너스명"], "이름 없음");
  const status = rowValue(row, ["표시상태", "이행보증상태"], "상태 없음");
  const code = rowValue(row, ["위촉코드"], "-");
  const phone = rowValue(row, ["휴대폰"], "-");
  const contracts = rowValue(row, ["누적계약건수", "당월계약건수"], "");
  return {
    title: `${badge(status)} <span class="name-token">${escapeHtml(personLabel(name, "P"))}</span>`,
    detail: `사번 ${code} / 연락처 ${phone}${contracts ? ` / 계약 ${contracts}건` : ""}`,
  };
}

function formatContractChat(row) {
  const agent = rowValue(row, ["지점원"], "지점원 없음");
  const customer = rowValue(row, ["고객"], "고객 없음");
  const priority = rowValue(row, ["재터치우선순위", "진행단계"], "확인");
  const product = rowValue(row, ["상품/내용"], "-");
  const days = rowValue(row, ["경과일수"], "0");
  const status = rowValue(row, ["처리상태", "진행단계"], "-");
  return {
    title: `${badge(priority)} <span class="name-token">${escapeHtml(personLabel(agent, "P"))}</span> <span class="muted">/</span> <span class="name-token">${escapeHtml(customer)}</span>`,
    detail: `${product} / ${status} / ${days}일 경과`,
  };
}

function formatHistoryChat(row) {
  const agent = rowValue(row, ["agent", "지점원"], "지점원 없음");
  const touchName = rowValue(row, ["터치이름", "고객"], "-");
  const date = rowValue(row, ["기록일", "처리일시"], "-");
  const note = rowValue(row, ["재터치내용", "처리메모"], "");
  return {
    title: `<span class="name-token">${escapeHtml(personLabel(agent, "P"))}</span> <span class="muted">/</span> ${escapeHtml(touchName)}`,
    detail: `${date} / ${compactText(note, 110)}`,
  };
}

async function buildIntentChatResults(query, intent) {
  const rows = await getJson(`${endpoints.dashboardTargets}?target=${encodeURIComponent(intent.target)}&limit=2000`);
  const terms = chatQueryTerms(query, true);
  const filtered = rows.filter((row) => rowMatchesTerms(row, terms));
  const formatter = intent.kind === "contract" ? formatContractChat : intent.kind === "candidate" ? formatCandidateChat : formatStaffChat;
  return chatSectionHtml(intent.title, filtered, intent.kind, formatter, 12);
}

async function buildGeneralChatResults(query) {
  await ensureChatData();
  const terms = chatQueryTerms(query);
  const candidates = uniqRows(
    state.chatData.candidates.filter((row) => rowMatchesTerms(row, terms)),
    (row) => `${rowValue(row, ["배양코드"])}|${rowValue(row, ["성명"])}`,
  );
  const staff = uniqRows(
    state.chatData.staff.filter((row) => rowMatchesTerms(row, terms)),
    (row) => rowValue(row, ["성명", "지점원"]),
  );
  const retouch = uniqRows(
    state.chatData.retouch.filter((row) => rowMatchesTerms(row, terms)),
    (row) => `${rowValue(row, ["지점원"])}|${rowValue(row, ["고객"])}`,
  );
  const contracts = uniqRows(
    state.chatData.contracts.filter((row) => rowMatchesTerms(row, terms)),
    (row) => `${rowValue(row, ["지점원"])}|${rowValue(row, ["고객"])}|${rowValue(row, ["상품/내용"])}`,
  );
  const detailCandidates = uniqRows(
    state.chatData.candidateDetails
      .filter((row) => rowMatchesTerms(row, terms))
      .map((detailRow) => {
        const code = rowValue(detailRow, ["배양코드"]);
        const base = state.chatData.candidates.find((row) => String(rowValue(row, ["배양코드"])) === String(code)) || {};
        return {
          ...base,
          ...detailRow,
          최근상담일자: rowValue(detailRow, ["상담일자"], rowValue(base, ["최근상담일자"])),
          최근상담내용: rowValue(detailRow, ["상담내용"], rowValue(base, ["최근상담내용"])),
        };
      }),
    (row) => `${rowValue(row, ["배양코드"])}|${rowValue(row, ["최근상담일자"])}|${rowValue(row, ["최근상담내용"])}`,
  );

  const historyAgents = new Set(
    [...staff.slice(0, 5).map((row) => rowValue(row, ["성명", "지점원"])), ...retouch.slice(0, 5).map((row) => rowValue(row, ["지점원"]))]
      .map((name) => String(name || "").trim())
      .filter(Boolean),
  );
  const historyRows = (
    await Promise.all(
      [...historyAgents].map(async (agent) => {
        const rows = await getJson(`${endpoints.retouchHistory}?agent=${encodeURIComponent(agent)}`);
        return rows.map((row) => ({ ...row, agent }));
      }),
    )
  )
    .flat()
    .filter((row) => rowMatchesTerms(row, terms) || normalizeChatText(row.agent).includes(normalizeChatText(query)));

  return [
    chatSectionHtml("지점원", staff, "staff", formatStaffChat, 6),
    chatSectionHtml("계약 재터치", retouch, "contract", formatContractChat, 8),
    chatSectionHtml("후보자", candidates, "candidate", formatCandidateChat, 8),
    chatSectionHtml("후보자 상담 이력", detailCandidates, "candidate", formatCandidateChat, 8),
    chatSectionHtml("계약/서류", contracts, "contract", formatContractChat, 6),
    chatSectionHtml("파트너스 재터치 기록", historyRows, "history", formatHistoryChat, 8),
  ].join("");
}

async function runChatSearch() {
  const input = document.getElementById("chatInput");
  const results = document.getElementById("chatResults");
  const query = input.value.trim();
  state.chatResults = [];
  if (!query) {
    results.innerHTML = `<div class="chat-empty">검색어를 입력하면 후보자, 지점원, 계약/서류 내용을 함께 보여드립니다.</div>`;
    return;
  }
  results.innerHTML = `<div class="chat-empty">검색 중입니다.</div>`;
  try {
    const intent = chatIntentFor(query);
    const html = intent ? await buildIntentChatResults(query, intent) : await buildGeneralChatResults(query);
    results.innerHTML = html || `<div class="chat-empty">검색 결과가 없습니다. 이름, 배양코드, 고객명, 업무명을 바꿔서 검색해 주세요.</div>`;
  } catch (error) {
    results.innerHTML = `<div class="chat-empty">검색 중 오류가 났습니다. 자료 새로 읽기 후 다시 시도해 주세요.</div>`;
  }
}

async function openChatResult(index) {
  const item = state.chatResults[Number(index)];
  if (!item) return;
  document.getElementById("chatPanel")?.classList.add("hidden");
  const row = item.row;
  if (item.kind === "candidate") {
    showPage("candidates");
    await showCandidateDetail(row);
    return;
  }
  if (item.kind === "staff" || item.kind === "guarantee" || item.kind === "history") {
    const agentName = rowValue(row, ["성명", "지점원", "파트너스명", "agent"]);
    showPage("staff");
    await showStaffDetailByName(agentName, "staffDetail");
    return;
  }
  if (item.kind === "contract") {
    showPage("contracts");
    await showContractDetail(row);
  }
}

async function loadTemplates() {
  state.templates = await getJson(endpoints.templates);
  const select = document.getElementById("templateSelect");
  select.innerHTML = Object.keys(state.templates)
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("");
  makeMessage();
}

function makeMessage() {
  const templateName = document.getElementById("templateSelect").value;
  const name = document.getElementById("messageName").value || "고객";
  const product = document.getElementById("messageProduct").value || "상품";
  const template = state.templates[templateName] || "";
  document.getElementById("messageOutput").value = template
    .replaceAll("{name}", name)
    .replaceAll("{product}", product);
}

async function copyMessage() {
  const output = document.getElementById("messageOutput");
  await navigator.clipboard.writeText(output.value);
  document.getElementById("copyMessage").textContent = "복사 완료";
  setTimeout(() => {
    document.getElementById("copyMessage").textContent = "문구 복사";
  }, 1200);
}

async function saveManualNote(trigger) {
  const scope = trigger?.closest(".detail-panel") || document;
  const input = scope.querySelector("#manualNoteInput");
  const status = scope.querySelector("#manualNoteStatus");
  if (!input || !status) return;
  status.textContent = "저장 중입니다.";
  const response = await fetch(endpoints.manualNote, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: input.dataset.code, note: input.value }),
  });
  const result = await response.json();
  status.textContent = result.ok ? `저장 완료 ${result.updated_at}` : "저장 실패";
  if (!result.ok) return;
  state.chatDataReady = false;
  state.chatData = {};
  if (state.manualNoteTarget?.type === "staff") {
    await showStaffDetailByName(state.manualNoteTarget.agent, state.manualNoteTarget.panelId || "staffDetail");
    return;
  }
  if (state.manualNoteTarget?.type === "candidate" && state.manualNoteTarget.row) {
    await showCandidateDetail(state.manualNoteTarget.row);
  }
}

async function saveRetouchAction(action) {
  const row = state.activeContractRow;
  const status = document.getElementById("retouchActionStatus");
  if (!row || !status) return;
  const note = document.getElementById("retouchActionNote")?.value || "";
  const followUpDate = document.getElementById("retouchFollowUpDate")?.value || "";
  status.textContent = "저장 중입니다.";
  const response = await fetch(endpoints.retouchAction, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      key: row.처리키,
      row,
      note,
      follow_up_date: followUpDate,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    status.textContent = result.error || "저장 실패";
    return;
  }
  status.textContent = action === "reset" ? "처리 상태를 해제했습니다." : `${result.status_label} 저장 완료`;
  state.contractRows = [];
  state.chatDataReady = false;
  state.chatData = {};
  await loadDashboard();
  if (state.page === "contracts") {
    await loadContracts();
  }
}

async function saveGuaranteeNotice(action) {
  const input = document.getElementById("guaranteeState");
  const status = document.getElementById("guaranteeNoticeStatus");
  const agent = input?.dataset.agent || "";
  if (!input || !status || !agent) return;
  status.textContent = "저장 중입니다.";
  const selectedAction = action || input.dataset.status || "요청";
  const response = await fetch(endpoints.guaranteeNotice, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: selectedAction, agent, amount: input.dataset.amount || "" }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    status.textContent = result.error || "저장 실패";
    return;
  }
  status.textContent = selectedAction === "reset" ? "처리 상태를 해제했습니다." : `${result.status_label} 저장 완료`;
  await loadDashboard();
  if (state.page === "staff") {
    await showStaffDetailByName(agent, "staffDetail");
  }
}

async function loadStaffLazySection(button) {
  const section = button.dataset.loadStaffSection || "";
  const agent = button.dataset.agent || "";
  const code = button.dataset.code || "";
  const body = document.querySelector(`[data-lazy-body="${section}"]`);
  const status = document.querySelector(`[data-lazy-status="${section}"]`);
  if (!body || !status || !agent) return;
  status.textContent = "불러오는 중입니다.";
  button.disabled = true;
  try {
    if (section === "consultation") {
      await ensureCandidateDetailData();
      const manualKey = code || `staff:${agent}`;
      const manualNote = await getManualNote(manualKey);
      const candidate = code ? state.candidateRows.find((row) => String(row.배양코드) === String(code)) || {} : {};
      body.innerHTML = code
        ? candidateConsultationTable(code, candidate.상담이력, manualNote)
        : `<div class="muted">연결된 후보자 상담 이력이 없습니다.</div>`;
    }
    if (section === "contracts") {
      body.innerHTML = await staffContractsByCustomer(agent);
    }
    status.textContent = "불러오기 완료";
    button.textContent = "새로고침";
  } catch (error) {
    status.textContent = "불러오기 실패";
    body.innerHTML = `<div class="muted">${escapeHtml(error.message || "자료를 불러오지 못했습니다.")}</div>`;
  } finally {
    button.disabled = false;
  }
}

async function saveUnpaidNotice(index, action = "") {
  const row = window.staffUnpaidRows?.[Number(index)];
  const stateInput = document.querySelector(`[data-unpaid-state="${index}"]`);
  const noteInput = document.querySelector(`[data-unpaid-note="${index}"]`);
  const status = document.querySelector(`[data-unpaid-message="${index}"]`);
  if (!row || !stateInput || !status) return;
  const selectedAction = action || stateInput.dataset.status || "";
  if (!selectedAction) {
    status.textContent = "입금, 유예, 예외 중 하나를 선택하세요.";
    return;
  }
  status.textContent = "저장 중입니다.";
  const response = await fetch(endpoints.unpaidNotice, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: selectedAction,
      key: stateInput.dataset.key || row.처리키,
      row,
      note: noteInput?.value || "",
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    status.textContent = result.error || "저장 실패";
    return;
  }
  status.textContent = selectedAction === "reset" ? "처리 상태를 해제했습니다." : `${result.status_label} 저장 완료`;
  await loadDashboard();
  if (state.page === "staff") {
    await showStaffDetailByName(row.파트너스명, "staffDetail");
  }
}

async function saveStaffOverride() {
  const button = document.getElementById("saveStaffOverride");
  const status = document.getElementById("staffOverrideStatus");
  if (!button || !status) return;
  const agent = button.dataset.agent || "";
  const panelId = button.dataset.panelId || "staffDetail";
  status.textContent = "저장 중입니다.";
  const response = await fetch(endpoints.staffOverride, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent,
      fields: {
        표시상태: document.getElementById("staffEditStatus")?.value || "",
        신입경력: document.getElementById("staffEditCareer")?.value || "",
        차월: document.getElementById("staffEditMonth")?.value || "",
        휴대폰: document.getElementById("staffEditPhone")?.value || "",
        위촉코드: document.getElementById("staffEditCode")?.value || "",
      },
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    status.textContent = result.error || "저장 실패";
    return;
  }
  status.textContent = `저장 완료 ${result.updated_at || ""}`;
  state.chatDataReady = false;
  state.chatData = {};
  await loadDashboard();
  await showStaffDetailByName(agent, panelId);
}

function showPage(page) {
  state.page = page;
  document.getElementById("chatPanel")?.classList.add("hidden");
  document.querySelectorAll(".page").forEach((element) => {
    element.classList.toggle("active", element.id === page);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  loadCurrentPage();
}

async function backToMenuStart(target) {
  if (target === "previous") {
    const previous = state.detailBack || { page: "dashboard", focus: "" };
    state.detailBack = null;
    if ((previous.page || "dashboard") === "dashboard" && previous.focus !== undefined) {
      state.dashboardFocus = previous.focus || "";
    }
    showPage(previous.page || "dashboard");
    return;
  }

  state.detailBack = null;

  if (target === "candidates") {
    document.getElementById("candidateSearch").value = "";
    document.getElementById("candidateStatusFilter").value = "";
    document.getElementById("candidatePassFilter").value = "";
    document.getElementById("candidateAppointFilter").value = "";
    state.candidateStaleOnly = false;
    setCandidateScheduleOpen(false);
    document.getElementById("candidateStaleToggle").classList.remove("active");
    document.getElementById("candidateDetail").classList.add("hidden");
    state.activeCandidateRow = null;
    await loadCandidates();
    return;
  }

  if (target === "staff") {
    document.getElementById("staffSearch").value = "";
    document.getElementById("staffDetail").classList.add("hidden");
    await loadStaff();
    return;
  }

  if (target === "contracts") {
    document.getElementById("contractSearch").value = "";
    state.contractStatus = "";
    document.querySelectorAll("[data-contract-status]").forEach((item) => item.classList.remove("active"));
    document.querySelector('[data-contract-status=""]').classList.add("active");
    document.getElementById("contractDetail").classList.add("hidden");
    await loadContracts();
  }
}

function applyRole() {
  state.role = document.getElementById("roleSelect").value;
  const educationOnly = state.role === "education";
  document.querySelectorAll(".manager-only").forEach((element) => {
    element.classList.toggle("hidden", educationOnly);
  });
  if (educationOnly && ["staff", "contracts"].includes(state.page)) {
    showPage("candidates");
    return;
  }
  if (state.page === "dashboard") {
    loadDashboard();
  }
}

async function refreshData() {
  const status = document.getElementById("refreshStatus");
  status.textContent = "자료를 다시 읽는 중입니다.";
  const response = await fetch("/api/refresh", { method: "POST" });
  const result = await response.json();
  status.textContent = result.ok ? "자료 갱신 완료" : "자료 갱신 실패";
  state.candidateRows = [];
  state.candidateDetailRows = [];
  state.contractRows = [];
  state.candidateFiltersReady = false;
  state.chatDataReady = false;
  state.chatData = {};
  await loadCurrentPage();
}

async function loadCurrentPage() {
  if (state.page === "dashboard") await loadDashboard();
  if (state.page === "candidates") await loadCandidates();
  if (state.page === "staff") await loadStaff();
  if (state.page === "contracts") await loadContracts();
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.detailBack = null;
      showPage(button.dataset.page);
    });
  });
  document.getElementById("roleSelect").addEventListener("change", applyRole);
  document.getElementById("refreshButton").addEventListener("click", refreshData);
  document.getElementById("candidateSearch").addEventListener("input", loadCandidates);
  document.getElementById("candidateStatusFilter").addEventListener("change", loadCandidates);
  document.getElementById("candidatePassFilter").addEventListener("change", loadCandidates);
  document.getElementById("candidateAppointFilter").addEventListener("change", loadCandidates);
  document.getElementById("candidateScheduleToggle").addEventListener("click", () => {
    setCandidateScheduleOpen(!state.candidateScheduleOpen);
  });
  document.getElementById("candidateScheduleClose").addEventListener("click", () => {
    setCandidateScheduleOpen(false);
  });
  document.getElementById("candidateStaleToggle").addEventListener("click", () => {
    state.candidateStaleOnly = !state.candidateStaleOnly;
    document.getElementById("candidateStaleToggle").classList.toggle("active", state.candidateStaleOnly);
    loadCandidates();
  });
  document.getElementById("staffSearch").addEventListener("input", loadStaff);
  document.getElementById("contractSearch").addEventListener("input", loadContracts);
  document.getElementById("makeMessage").addEventListener("click", makeMessage);
  document.getElementById("copyMessage").addEventListener("click", copyMessage);
  document.getElementById("templateSelect").addEventListener("change", makeMessage);
  document.getElementById("messageName").addEventListener("input", makeMessage);
  document.getElementById("messageProduct").addEventListener("input", makeMessage);
  document.getElementById("summaryCards").addEventListener("click", (event) => {
    const item = event.target.closest("[data-dashboard-target]");
    if (item) renderDashboardFocus(item.dataset.dashboardTarget);
  });
  document.getElementById("dashboardPriority").addEventListener("click", (event) => {
    const item = event.target.closest("[data-dashboard-target]");
    if (item) renderDashboardFocus(item.dataset.dashboardTarget);
  });
  document.getElementById("dashboardFocusReset").addEventListener("click", () => {
    state.dashboardFocus = "";
    renderDashboardFocus("");
  });
  document.getElementById("dashboardFocusSearch").addEventListener("input", renderDashboardFocusRows);
  document.getElementById("dashboardFocusList").addEventListener("click", (event) => {
    const item = event.target.closest("[data-action]");
    if (item) openDashboardFocusItem(item.dataset.action, item.dataset.key);
  });
  document.getElementById("chatToggle").addEventListener("click", () => {
    document.getElementById("chatPanel").classList.toggle("hidden");
    if (!document.getElementById("chatPanel").classList.contains("hidden")) {
      document.getElementById("chatInput").focus();
    }
  });
  document.getElementById("chatClose").addEventListener("click", () => {
    document.getElementById("chatPanel").classList.add("hidden");
  });
  document.getElementById("chatSearchButton").addEventListener("click", runChatSearch);
  document.getElementById("chatInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") runChatSearch();
  });
  document.getElementById("chatResults").addEventListener("click", (event) => {
    const item = event.target.closest("[data-chat-index]");
    if (item) openChatResult(item.dataset.chatIndex);
  });
  document.querySelectorAll("[data-contract-status]").forEach((button) => {
    button.addEventListener("click", () => {
      state.contractStatus = button.dataset.contractStatus;
      document.querySelectorAll("[data-contract-status]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      loadContracts();
    });
  });
  document.getElementById("homeRetouch").addEventListener("click", (event) => {
    const item = event.target.closest("[data-action='contract-detail']");
    if (item) openContractFromHome(item.dataset.key);
  });
  document.getElementById("homeGuarantee").addEventListener("click", (event) => {
    const item = event.target.closest("[data-action='guarantee-detail']");
    if (item) openGuaranteeFromHome(item.dataset.key);
  });
  document.getElementById("homeTraining").addEventListener("click", (event) => {
    const item = event.target.closest("[data-action='training-detail']");
    if (item) openTrainingFromHome(item.dataset.key);
  });
  document.getElementById("homeCandidates").addEventListener("click", (event) => {
    const item = event.target.closest("[data-action='candidate-detail']");
    if (item) openCandidateFromHome(item.dataset.key);
  });
  document.getElementById("homeStaff").addEventListener("click", (event) => {
    const item = event.target.closest("[data-action='staff-detail-home']");
    if (item) openStaffFromHome(item.dataset.key);
  });
  document.addEventListener("click", async (event) => {
    const backButton = event.target.closest("[data-back-target]");
    if (backButton) {
      await backToMenuStart(backButton.dataset.backTarget);
      return;
    }

    const sortButton = event.target.closest("[data-sort-target]");
    if (sortButton) {
      const targetId = sortButton.dataset.sortTarget;
      const key = sortButton.dataset.sortKey;
      const current = state.sort[targetId];
      state.sort[targetId] = {
        key,
        direction: current?.key === key && current.direction === "asc" ? "desc" : "asc",
      };
      await loadCurrentPage();
      return;
    }

    const candidateRow = event.target.closest("[data-row-action='candidate-detail']");
    if (candidateRow) {
      const row = window.tableRows?.candidateTable?.[Number(candidateRow.dataset.rowIndex)];
      state.detailBack = null;
      if (row) await showCandidateDetail(row);
      return;
    }

    const staffRow = event.target.closest("[data-row-action='staff-detail']");
    if (staffRow) {
      const row = window.tableRows?.staffTable?.[Number(staffRow.dataset.rowIndex)];
      state.detailBack = null;
      if (row) await showStaffDetailByName(row.성명, "staffDetail");
      return;
    }

    const contractStaffRow = event.target.closest("[data-row-action='contract-staff-detail']");
    if (contractStaffRow) {
      const row = window.tableRows?.contractTable?.[Number(contractStaffRow.dataset.rowIndex)];
      state.detailBack = null;
      if (row) await showStaffDetailByName(row.지점원, "contractDetail");
      return;
    }

    if (event.target.id === "saveManualNote") {
      await saveManualNote(event.target);
      return;
    }

    if (event.target.id === "saveStaffOverride") {
      await saveStaffOverride();
      return;
    }

    const retouchButton = event.target.closest("[data-retouch-action]");
    if (retouchButton) {
      await saveRetouchAction(retouchButton.dataset.retouchAction);
      return;
    }

    const guaranteeButton = event.target.closest("[data-guarantee-action]");
    if (guaranteeButton) {
      await saveGuaranteeNotice(guaranteeButton.dataset.guaranteeAction);
      return;
    }

    if (event.target.id === "saveGuaranteeNotice") {
      await saveGuaranteeNotice();
      return;
    }

    const staffLazyButton = event.target.closest("[data-load-staff-section]");
    if (staffLazyButton) {
      await loadStaffLazySection(staffLazyButton);
      return;
    }

    const unpaidSaveButton = event.target.closest("[data-unpaid-save]");
    if (unpaidSaveButton) {
      await saveUnpaidNotice(unpaidSaveButton.dataset.unpaidSave);
      return;
    }

    const unpaidResetButton = event.target.closest("[data-unpaid-reset]");
    if (unpaidResetButton) {
      await saveUnpaidNotice(unpaidResetButton.dataset.unpaidReset, "reset");
      return;
    }

    const unpaidStatusButton = event.target.closest("[data-unpaid-status]");
    if (unpaidStatusButton) {
      const index = unpaidStatusButton.dataset.unpaidIndex;
      const input = document.querySelector(`[data-unpaid-state="${index}"]`);
      if (input) input.dataset.status = unpaidStatusButton.dataset.unpaidStatus;
      document.querySelectorAll(`[data-unpaid-index="${index}"]`).forEach((item) => item.classList.remove("active"));
      unpaidStatusButton.classList.add("active");
      return;
    }

    const guaranteeStatusButton = event.target.closest("[data-guarantee-status]");
    if (guaranteeStatusButton) {
      const input = document.getElementById("guaranteeState");
      if (input) input.dataset.status = guaranteeStatusButton.dataset.guaranteeStatus;
      document.querySelectorAll("[data-guarantee-status]").forEach((item) => item.classList.remove("active"));
      guaranteeStatusButton.classList.add("active");
      return;
    }

    const guaranteeAmountButton = event.target.closest("[data-guarantee-amount]");
    if (guaranteeAmountButton) {
      const input = document.getElementById("guaranteeState");
      if (input) input.dataset.amount = guaranteeAmountButton.dataset.guaranteeAmount;
      document.querySelectorAll("[data-guarantee-amount]").forEach((item) => item.classList.remove("active"));
      guaranteeAmountButton.classList.add("active");
    }
  });
}

async function init() {
  bindEvents();
  applyRole();
  await loadTemplates();
  await loadDashboard();
}

init().catch((error) => {
  document.body.innerHTML = `<main class="main"><section class="panel"><h2>관리판을 불러오지 못했습니다.</h2><p>${escapeHtml(error.message)}</p></section></main>`;
});
