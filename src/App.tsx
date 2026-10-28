import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Home,
  User,
  Sparkles,
  TrendingUp,
  Award,
  Mail,
  MessageSquareHeart,
  Settings,
  LogOut,
  ShieldCheck,
  Users,
  FileCheck,
  Shuffle,
  ShieldAlert,
  BarChart3,
  PanelRightClose,
  PanelRightOpen,
  Lock,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import {
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  UserProfile,
  Mission,
  MissionSubmission,
  ScoreLedger,
  StudentStats,
  Badge,
  BadgeAward,
  ManittoAssignment,
  LetterThread,
  Letter,
  LoungeSession,
  LoungeParticipant,
  LoungeMessage,
  ReportRecord,
  AuditLog,
  AppSetting,
  StudentNavTab,
  TeacherNavTab,
} from './types/manitto';
import {
  ensureWorkspaceSeeded,
  hashPassword,
  recordAuditLog,
} from './services/manittoServerEngine';
import {
  getInitialUsers,
  getInitialMissions,
  getInitialBadges,
  getInitialAssignments,
} from './data/seedData';
import { AvatarIllustration } from './components/AvatarIllustration';
import { StudentViews } from './components/StudentViews';
import { TeacherViews } from './components/TeacherViews';
import { RightSummaryPanel } from './components/RightSummaryPanel';

const WORKSPACE_ID = 'shindong_5_2_ws';
const SESSION_STORAGE_KEY = 'shindong_manitto_logged_uid';

export default function App() {
  const [seeding, setSeeding] = useState(true);

  // Login Screen State (Student Roster Click + Password OR Teacher Admin ID + Password)
  const [loginRoleTab, setLoginRoleTab] = useState<'student' | 'teacher'>('student');
  const [selectedStudentUidForLogin, setSelectedStudentUidForLogin] = useState<string>('');
  const [teacherLoginIdInput, setTeacherLoginIdInput] = useState('teacher');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Logged-in User UID (persisted in sessionStorage for refresh convenience, cleared on logout)
  const [loggedInUid, setLoggedInUid] = useState<string>(() => {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) || '';
  });

  // Navigation & UI State
  const [studentTab, setStudentTab] = useState<StudentNavTab>('home');
  const [teacherTab, setTeacherTab] = useState<TeacherNavTab>('dashboard');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  // Password Change Modal State (Accessible from header for both Teacher & Student)
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [modalAdminId, setModalAdminId] = useState('');
  const [modalCurrentPw, setModalCurrentPw] = useState('');
  const [modalNewPw, setModalNewPw] = useState('');
  const [modalConfirmPw, setModalConfirmPw] = useState('');
  const [modalSaving, setModalSaving] = useState(false);

  // Toast Notification
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  // Real-time Firestore Collections State
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [submissions, setSubmissions] = useState<MissionSubmission[]>([]);
  const [ledger, setLedger] = useState<ScoreLedger[]>([]);
  const [stats, setStats] = useState<StudentStats[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [badgeAwards, setBadgeAwards] = useState<BadgeAward[]>([]);
  const [assignments, setAssignments] = useState<ManittoAssignment[]>([]);
  const [letterThreads, setLetterThreads] = useState<LetterThread[]>([]);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [loungeSessions, setLoungeSessions] = useState<LoungeSession[]>([]);
  const [loungeParticipants, setLoungeParticipants] = useState<LoungeParticipant[]>([]);
  const [loungeMessages, setLoungeMessages] = useState<LoungeMessage[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [appSettingsList, setAppSettingsList] = useState<AppSetting[]>([]);

  const showToast = (
    message: string,
    type: 'success' | 'error' | 'info' = 'info'
  ) => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  // Watchdog & Loading State
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const runWorkspaceInit = async () => {
    setSeeding(true);
    setLoadError(null);
    try {
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error('데이터베이스 응답 시간이 6초를 초과했습니다.')),
          6000
        )
      );
      await Promise.race([ensureWorkspaceSeeded(WORKSPACE_ID), timeoutPromise]);
    } catch (err) {
      console.error('Seed/Init error:', err);
      setLoadError(err instanceof Error ? err.message : '초기화 실패');
    } finally {
      setSeeding(false);
    }
  };

  // 1. Seed Initial Classroom Data in Cloud Firestore on Boot (No Google Popup needed)
  useEffect(() => {
    runWorkspaceInit();
  }, []);

  // Timer to detect slow network or hanging database connection
  useEffect(() => {
    if (allUsers.length > 0) return;
    const interval = setInterval(() => {
      setLoadingSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [allUsers.length]);

  // Offline or instant preview fallback mode if Firestore connection is slow
  const handleLoadSampleDataFallback = () => {
    const prefix = WORKSPACE_ID.slice(0, 8);
    const initialUsers = getInitialUsers(WORKSPACE_ID).map((u) => {
      const uId = `${prefix}_${u.uid}`;
      return {
        ...u,
        uid: uId,
        createdAt: null as any,
        updatedAt: null as any,
      };
    });
    setAllUsers(initialUsers);
    setMissions(
      getInitialMissions(WORKSPACE_ID).map((m) => ({
        ...m,
        missionId: `${prefix}_${m.missionId}`,
        createdAt: null as any,
        updatedAt: null as any,
      }))
    );
    setBadges(
      getInitialBadges(WORKSPACE_ID).map((b) => ({
        ...b,
        badgeId: `${prefix}_${b.badgeId}`,
        createdAt: null as any,
        updatedAt: null as any,
      }))
    );
    setAssignments(
      getInitialAssignments(WORKSPACE_ID).map((a) => ({
        ...a,
        assignmentId: `${prefix}_${a.assignmentId}`,
        giverUid: `${prefix}_${a.giverUid}`,
        receiverUid: `${prefix}_${a.receiverUid}`,
        createdAt: null as any,
        updatedAt: null as any,
      }))
    );
    setSeeding(false);
    showToast('체험용 학급 명단 데이터로 즉시 전환되었습니다.', 'info');
  };

  // 2. Real-time Firestore Listeners (Start immediately on mount so users load right away)
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    const subscribeCol = <T,>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>
    ) => {
      const q = query(
        collection(db, colName),
        where('workspaceOwnerUid', '==', WORKSPACE_ID)
      );
      const u = onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => d.data() as T);
          setter(items);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, colName)
      );
      unsubs.push(u);
    };

    subscribeCol<UserProfile>('users', setAllUsers);
    subscribeCol<Mission>('missions', setMissions);
    subscribeCol<MissionSubmission>('missionSubmissions', setSubmissions);
    subscribeCol<ScoreLedger>('scoreLedger', setLedger);
    subscribeCol<StudentStats>('studentStats', setStats);
    subscribeCol<Badge>('badges', setBadges);
    subscribeCol<BadgeAward>('badgeAwards', setBadgeAwards);
    subscribeCol<ManittoAssignment>('manittoAssignments', setAssignments);
    subscribeCol<LetterThread>('letterThreads', setLetterThreads);
    subscribeCol<Letter>('letters', setLetters);
    subscribeCol<LoungeSession>('loungeSessions', setLoungeSessions);
    subscribeCol<LoungeMessage>('loungeMessages', setLoungeMessages);
    subscribeCol<ReportRecord>('reports', setReports);
    subscribeCol<AuditLog>('auditLogs', setAuditLogs);
    subscribeCol<AppSetting>('appSettings', setAppSettingsList);

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, []);

  // 3. Subscribe to Lounge Participants subcollection for the active lounge session
  const currentLoungeSession = loungeSessions[0] || null;
  useEffect(() => {
    if (!currentLoungeSession) return;
    const subPath = `loungeSessions/${currentLoungeSession.sessionId}/participants`;
    const q = query(
      collection(db, 'loungeSessions', currentLoungeSession.sessionId, 'participants'),
      where('workspaceOwnerUid', '==', WORKSPACE_ID)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLoungeParticipants(snap.docs.map((d) => d.data() as LoungeParticipant));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, subPath)
    );
    return () => unsub();
  }, [currentLoungeSession?.sessionId]);

  // Roster of Students registered by the Teacher
  const rosterStudents = useMemo(
    () =>
      allUsers
        .filter((u) => u.role === 'student')
        .sort((a, b) => a.studentLoginId.localeCompare(b.studentLoginId)),
    [allUsers]
  );

  // Default select first student on login screen roster if none selected
  useEffect(() => {
    if (!selectedStudentUidForLogin && rosterStudents.length > 0) {
      setSelectedStudentUidForLogin(rosterStudents[0].uid);
    }
  }, [rosterStudents, selectedStudentUidForLogin]);

  const activeUser = useMemo(
    () => allUsers.find((u) => u.uid === loggedInUid) || null,
    [allUsers, loggedInUid]
  );

  // 4. Real-time Session Heartbeat for Logged-In User
  useEffect(() => {
    if (!activeUser) return;
    const sendBeat = async () => {
      try {
        await updateDoc(doc(db, 'users', activeUser.uid), {
          lastHeartbeatAt: new Date().toISOString(),
          isOnlineSession: true,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore transient beat errors
      }
    };
    sendBeat();
    const timer = setInterval(sendBeat, 60 * 1000);
    return () => clearInterval(timer);
  }, [activeUser?.uid]);

  // 5. Handle Student Roster Login OR Teacher Admin Login (No Google Popup!)
  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const trimmedPw = loginPassword.trim();
    if (!trimmedPw) {
      setLoginError('비밀번호를 입력해 주세요.');
      return;
    }

    if (loginRoleTab === 'student') {
      const targetStudent = rosterStudents.find(
        (s) => s.uid === selectedStudentUidForLogin
      );
      if (!targetStudent) {
        setLoginError('먼저 명단에서 자신의 이름을 클릭해 선택해 주세요.');
        return;
      }
      if (targetStudent.accountStatus === 'inactive') {
        setLoginError('비활성화된 학생 계정입니다. 담임선생님께 계정 복구를 요청해 주세요.');
        return;
      }

      const inputHash = await hashPassword(trimmedPw);
      if (targetStudent.passwordHash !== inputHash) {
        setLoginError(
          `${targetStudent.displayName} 학생의 비밀번호가 일치하지 않습니다. (비밀번호를 잊었다면 선생님께 초기화를 요청하세요)`
        );
        return;
      }

      await updateDoc(doc(db, 'users', targetStudent.uid), {
        lastLoginAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        isOnlineSession: true,
        updatedAt: serverTimestamp(),
      });

      sessionStorage.setItem(SESSION_STORAGE_KEY, targetStudent.uid);
      setLoggedInUid(targetStudent.uid);
      setLoginPassword('');
      setStudentTab('home');
      showToast(
        `${targetStudent.displayName} 친구, 반가워요! 오늘도 따뜻한 친절을 실천해 볼까요?`,
        'success'
      );
    } else {
      const trimmedId = teacherLoginIdInput.trim();
      const teacherAccount = allUsers.find(
        (u) => u.role === 'teacher' && u.studentLoginId === trimmedId
      );

      if (!teacherAccount) {
        setLoginError('교사 관리자 아이디가 일치하지 않습니다.');
        return;
      }

      const inputHash = await hashPassword(trimmedPw);
      if (teacherAccount.passwordHash !== inputHash) {
        setLoginError('교사 관리자 비밀번호가 일치하지 않습니다.');
        return;
      }

      await updateDoc(doc(db, 'users', teacherAccount.uid), {
        lastLoginAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        isOnlineSession: true,
        updatedAt: serverTimestamp(),
      });

      sessionStorage.setItem(SESSION_STORAGE_KEY, teacherAccount.uid);
      setLoggedInUid(teacherAccount.uid);
      setLoginPassword('');
      setTeacherTab('dashboard');
      showToast(
        `${teacherAccount.displayName}님, 교사 관리자 대시보드에 로그인되었습니다.`,
        'success'
      );
    }
  };

  const handleLogout = async () => {
    if (activeUser) {
      try {
        await updateDoc(doc(db, 'users', activeUser.uid), {
          isOnlineSession: false,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore
      }
    }
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setLoggedInUid('');
    setLoginPassword('');
    setLoginError('');
  };

  // Open Password Change Modal
  const openPasswordModal = () => {
    if (!activeUser) return;
    setModalAdminId(activeUser.studentLoginId);
    setModalCurrentPw('');
    setModalNewPw('');
    setModalConfirmPw('');
    setPwModalOpen(true);
  };

  // Submit Password Change from Modal (Works for both Student and Teacher)
  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser || modalSaving) return;

    if (modalNewPw.trim().length < 4) {
      showToast('새 비밀번호는 4자리 이상으로 입력해 주세요.', 'error');
      return;
    }
    if (modalNewPw.trim() !== modalConfirmPw.trim()) {
      showToast('새 비밀번호와 비밀번호 확인이 일치하지 않습니다.', 'error');
      return;
    }

    setModalSaving(true);
    try {
      const curHash = await hashPassword(modalCurrentPw.trim());
      if (curHash !== activeUser.passwordHash) {
        showToast('현재 비밀번호가 일치하지 않습니다.', 'error');
        setModalSaving(false);
        return;
      }

      const nextHash = await hashPassword(modalNewPw.trim());
      const updates: Record<string, unknown> = {
        passwordHash: nextHash,
        updatedAt: serverTimestamp(),
      };

      if (activeUser.role === 'teacher') {
        const cleanAdminId = modalAdminId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
        if (cleanAdminId.length < 3) {
          showToast('관리자 아이디는 영문/숫자 3자 이상이어야 합니다.', 'error');
          setModalSaving(false);
          return;
        }
        updates.studentLoginId = cleanAdminId;
      }

      await updateDoc(doc(db, 'users', activeUser.uid), updates);

      if (activeUser.role === 'teacher') {
        await recordAuditLog({
          workspaceOwnerUid: WORKSPACE_ID,
          actorUid: activeUser.uid,
          actorName: activeUser.displayName,
          action: 'TEACHER_PASSWORD_CHANGED',
          targetType: 'user',
          targetId: activeUser.uid,
          reason: '교사 관리자 아이디/비밀번호 보안 변경',
          metadataSummary: `관리자 아이디: ${updates.studentLoginId || activeUser.studentLoginId}`,
        });
      }

      setPwModalOpen(false);
      showToast(
        activeUser.role === 'teacher'
          ? '교사 관리자 아이디와 비밀번호가 안전하게 변경되었습니다!'
          : '나의 비밀번호가 안전하게 변경되었어요!',
        'success'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${activeUser.uid}`);
    } finally {
      setModalSaving(false);
    }
  };

  // Loading Screen (Safe against infinite loading, with watchdog timer & retry & instant sample fallback)
  if (allUsers.length === 0) {
    return (
      <div className="min-h-screen bg-[#E2F2EA] flex items-center justify-center p-4 sm:p-6">
        <div className="bg-[#FBF9F5] rounded-[36px] p-6 sm:p-10 max-w-lg w-full text-center shadow-lg border border-white space-y-4 break-keep">
          <div className="w-16 h-16 rounded-2xl bg-[#C6F0DF] flex items-center justify-center mx-auto text-3xl shadow-xs">
            🌱
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#141413] tracking-tight">
            전주신동초 마니또
          </h1>

          <div className="space-y-1.5">
            <p className="text-xs sm:text-sm font-bold text-[#141413]">
              {loadingSeconds < 3
                ? '우리 반 명단과 마니또 활동 데이터를 불러오고 있어요...'
                : loadingSeconds < 6
                ? '데이터베이스 연결 및 초기 학급 명단을 확인하고 있습니다...'
                : '데이터베이스 연결에 지연이 발생하고 있습니다.'}
            </p>
            <p className="text-[11px] text-[#6B665E]">
              전주신동초 5학년 2반 마니또 워크스페이스 실시간 동기화 중 ({loadingSeconds}초 경과)
            </p>
          </div>

          {loadError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-3 text-xs text-left">
              <p className="font-extrabold mb-0.5">안내:</p>
              <p className="leading-relaxed">{loadError}</p>
            </div>
          )}

          {/* Action Buttons to Prevent Getting Stuck */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={runWorkspaceInit}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-[#141413] text-white text-xs font-extrabold hover:bg-[#2C2A27] cursor-pointer shadow-xs"
            >
              🌱 초기 명단 생성 및 다시 시도
            </button>
            <button
              type="button"
              onClick={handleLoadSampleDataFallback}
              className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-[#DDD5F8] text-[#3730A3] text-xs font-extrabold hover:bg-[#C9BFF3] cursor-pointer shadow-xs"
            >
              ⚡ 체험 모드로 즉시 열기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // LOGIN SCREEN (No Google Popup — Direct Student Roster Selection or Teacher Login)
  // ============================================================================
  if (!activeUser) {
    const selectedStudentObj = rosterStudents.find(
      (s) => s.uid === selectedStudentUidForLogin
    );

    return (
      <div className="min-h-screen bg-[#E2F2EA] flex items-center justify-center p-3 sm:p-6 lg:p-8">
        <div className="bg-[#FBF9F5] rounded-[36px] sm:rounded-[44px] max-w-6xl w-full p-5 sm:p-8 lg:p-10 shadow-sm grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start border border-white break-keep">
          {/* Left Intro Column */}
          <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-8">
            <div className="inline-flex items-center gap-2 bg-[#F3EFEA] rounded-2xl px-3.5 py-2 text-xs font-bold text-[#141413]">
              <span>🏫 전주신동초등학교 5학년 2반</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#141413] tracking-tight leading-snug">
              나의 따뜻한 행동이
              <br />
              우리 반을 바꿔요!
            </h1>

            <p className="text-xs sm:text-sm text-[#5C574F] leading-relaxed">
              <strong>「전주신동초 마니또」</strong>에 오신 것을 환영해요! 학생은 오른쪽 우리 반 명단에서 자신의 이름을 클릭하고 비밀번호를 입력해 입장하세요.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="bg-[#F6D4D2] rounded-2xl p-4">
                <span className="text-lg">🌱</span>
                <h3 className="text-xs font-extrabold text-[#141413] mt-1">
                  마니또 미션 20종 & 뱃지 5종
                </h3>
                <p className="text-[11px] text-[#3D3A35] mt-0.5">
                  친절·배려·관찰 실천 기록과 성장 그래프
                </p>
              </div>
              <div className="bg-[#DDD5F8] rounded-2xl p-4">
                <span className="text-lg">💌</span>
                <h3 className="text-xs font-extrabold text-[#141413] mt-1">
                  익명 편지함 & 학급 라운지
                </h3>
                <p className="text-[11px] text-[#3D3A35] mt-0.5">
                  실시간 별명 대화와 안전한 교사 보호
                </p>
              </div>
            </div>
          </div>

          {/* Right Login Card */}
          <div className="lg:col-span-7 bg-[#F3EFEA] rounded-[32px] p-6 sm:p-8 space-y-5">
            {/* Role Tabs */}
            <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setLoginRoleTab('student');
                  setLoginError('');
                  setLoginPassword('');
                }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${
                  loginRoleTab === 'student'
                    ? 'bg-[#141413] text-white'
                    : 'text-[#5C574F] hover:text-[#141413]'
                }`}
              >
                🎒 학생 명단에서 선택하여 입장
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginRoleTab('teacher');
                  setLoginError('');
                  setLoginPassword('');
                }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${
                  loginRoleTab === 'teacher'
                    ? 'bg-[#141413] text-white'
                    : 'text-[#5C574F] hover:text-[#141413]'
                }`}
              >
                👩‍🏫 교사 관리자 로그인
              </button>
            </div>

            {loginError && (
              <div className="bg-rose-100 text-rose-800 rounded-2xl p-3.5 text-xs font-bold">
                {loginError}
              </div>
            )}

            {loginRoleTab === 'student' ? (
              <form onSubmit={handleDirectLogin} className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="text-xs font-extrabold text-[#141413]">
                      1. 선생님이 등록한 우리 반 명단에서 내 이름을 클릭하세요 ({rosterStudents.length}명)
                    </label>
                    <span className="text-[11px] text-[#6B665E]">
                      클릭하여 선택
                    </span>
                  </div>

                  {/* Interactive Student Roster Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
                    {rosterStudents.map((stu) => {
                      const isSelected = stu.uid === selectedStudentUidForLogin;
                      const isInactive = stu.accountStatus === 'inactive';
                      return (
                        <button
                          key={stu.uid}
                          type="button"
                          disabled={isInactive}
                          onClick={() => {
                            setSelectedStudentUidForLogin(stu.uid);
                            setLoginError('');
                          }}
                          className={`p-3 rounded-2xl text-left flex items-center gap-2.5 transition-all cursor-pointer border-2 ${
                            isInactive
                              ? 'bg-[#E6E1D6] opacity-50 border-transparent cursor-not-allowed'
                              : isSelected
                              ? 'bg-[#141413] text-white border-[#141413] shadow-xs'
                              : 'bg-white text-[#141413] border-transparent hover:border-[#D6D1C7]'
                          }`}
                        >
                          <AvatarIllustration avatarId={stu.avatarId} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-extrabold truncate">
                              {stu.displayName}
                            </p>
                            <p
                              className={`text-[10px] truncate ${
                                isSelected ? 'text-white/80' : 'text-[#6B665E]'
                              }`}
                            >
                              {isInactive ? '비활성 계정' : stu.studentLoginId}
                            </p>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-[#C6F0DF] shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Student Password Input */}
                <div className="bg-white rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold text-[#141413]">
                      2.{' '}
                      {selectedStudentObj
                        ? `[${selectedStudentObj.displayName}] 학생의 비밀번호 입력`
                        : '비밀번호 입력'}
                    </label>
                    <span className="text-[11px] font-semibold text-[#6B665E]">
                      초기 비밀번호: 1234
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="비밀번호를 입력하세요 (초기값: 1234)"
                      required
                      className="flex-1 rounded-xl bg-[#F3EFEA] px-4 py-3 text-sm text-[#141413] font-bold focus:outline-none focus:ring-2 focus:ring-[#141413]"
                    />
                    <button
                      type="submit"
                      className="px-6 py-3 rounded-xl bg-[#141413] text-white text-xs font-extrabold hover:bg-[#2C2A27] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {selectedStudentObj
                        ? `${selectedStudentObj.displayName}(으)로 입장하기 →`
                        : '입장하기 →'}
                    </button>
                  </div>

                  <p className="text-[11px] text-[#6B665E]">
                    💡 입장한 뒤 상단의 <strong>[🔒 비밀번호 변경]</strong> 또는 <strong>[설정]</strong> 메뉴에서 나만의 비밀번호로 직접 바꿀 수 있어요!
                  </p>
                </div>
              </form>
            ) : (
              /* Teacher Admin Login Form */
              <form onSubmit={handleDirectLogin} className="space-y-4">
                <div className="bg-[#E0F2FE] rounded-2xl p-4 text-xs text-[#0369A1] font-semibold leading-relaxed">
                  🔒 교사 전용 관리 공간입니다. 관리자 아이디와 비밀번호를 입력해 주세요. 로그인 후 다른 사람이 들어오지 못하도록 관리자 아이디와 비밀번호를 변경할 수 있습니다.
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-[#141413] mb-1.5">
                    교사 관리자 아이디 (초기 아이디: teacher)
                  </label>
                  <input
                    type="text"
                    value={teacherLoginIdInput}
                    onChange={(e) => setTeacherLoginIdInput(e.target.value)}
                    placeholder="관리자 아이디 입력"
                    required
                    className="w-full rounded-xl bg-white px-4 py-3 text-sm text-[#141413] font-bold focus:outline-none focus:ring-2 focus:ring-[#141413]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-[#141413] mb-1.5">
                    교사 관리자 비밀번호 (초기 비밀번호: 1234)
                  </label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="관리자 비밀번호 입력"
                    required
                    className="w-full rounded-xl bg-white px-4 py-3 text-sm text-[#141413] font-bold focus:outline-none focus:ring-2 focus:ring-[#141413]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl bg-[#141413] text-white text-xs font-extrabold hover:bg-[#2C2A27] cursor-pointer shadow-xs"
                >
                  교사 관리자 대시보드 입장하기 →
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isTeacherMode = activeUser.role === 'teacher';

  const studentNavItems: Array<{
    id: StudentNavTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'home', label: '홈', icon: Home },
    { id: 'profile', label: '나의 프로필', icon: User },
    { id: 'missions', label: '마니또 미션', icon: Sparkles },
    { id: 'growth', label: '나의 성장', icon: TrendingUp },
    { id: 'badges', label: '뱃지 컬렉션', icon: Award },
    {
      id: 'letters',
      label: '익명 편지함',
      icon: Mail,
      badge: letters.filter(
        (l) =>
          l.receiverUid === activeUser.uid &&
          !l.readAt &&
          l.moderationStatus !== 'hidden' &&
          !l.deletedAt
      ).length,
    },
    { id: 'lounge', label: '익명 라운지', icon: MessageSquareHeart },
    { id: 'settings', label: '설정·비밀번호', icon: Settings },
  ];

  const teacherNavItems: Array<{
    id: TeacherNavTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'dashboard', label: '교사 홈', icon: ShieldCheck },
    { id: 'students', label: '학생 명단·계정', icon: Users },
    { id: 'activities', label: '학생별 활동 기록', icon: FileCheck },
    {
      id: 'missions',
      label: '미션 관리·승인',
      icon: Sparkles,
      badge: submissions.filter((s) => s.status === 'pending').length,
    },
    { id: 'assignments', label: '마니또 배정', icon: Shuffle },
    {
      id: 'reports',
      label: '신고 검토',
      icon: ShieldAlert,
      badge: reports.filter((r) => r.status === 'pending').length,
    },
    { id: 'lounge', label: '라운지 운영', icon: MessageSquareHeart },
    { id: 'stats', label: '학급 통계', icon: BarChart3 },
    { id: 'settings', label: '보안·감사로그', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#E2F2EA] p-2 sm:p-4 lg:p-6 xl:p-8 break-keep">
      {/* Main Outer App Container: Uses full window comfortably up to 1800px wide */}
      <div className="w-full max-w-[1800px] mx-auto bg-[#FBF9F5] rounded-[28px] sm:rounded-[40px] shadow-sm border border-white p-3.5 sm:p-6 lg:p-7 min-h-[calc(100vh-1rem)] sm:min-h-[calc(100vh-2rem)] flex flex-col">
        {/* Top Bar (3-Zone Contract: Brand Wordmark — Logged-in User Info — Password Change & Logout Actions) */}
        <header className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-[#EFECE6]">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-[#141413] text-white flex items-center justify-center font-extrabold text-sm shadow-xs">
              신
            </div>
            <span className="text-base sm:text-lg font-extrabold tracking-tight text-[#141413] whitespace-nowrap">
              전주신동초 마니또
            </span>
          </div>

          {/* Zone 2: Current Authenticated Identity */}
          <div className="hidden md:flex items-center gap-2 text-xs font-bold text-[#4A463F]">
            <span>
              {isTeacherMode
                ? `👩‍🏫 교사 관리자 모드 (${activeUser.displayName} · ID: ${activeUser.studentLoginId})`
                : `🎒 5학년 2반 ${activeUser.displayName} 학생`}
            </span>
          </div>

          {/* Zone 3: Password Change & Right Panel Toggle & Logout */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openPasswordModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#C6F0DF] text-[#065F46] text-xs font-extrabold hover:bg-[#B2E8D2] cursor-pointer whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{isTeacherMode ? '관리자 비밀번호 변경' : '비밀번호 변경'}</span>
            </button>

            <button
              type="button"
              onClick={() => setRightPanelOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F3EFEA] text-xs font-bold text-[#141413] hover:bg-[#E7E2D8] cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
              title={rightPanelOpen ? '우측 요약 패널 접기' : '우측 요약 패널 열기'}
            >
              {rightPanelOpen ? (
                <>
                  <PanelRightClose className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">우측 요약 접기</span>
                </>
              ) : (
                <>
                  <PanelRightOpen className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">우측 요약 열기</span>
                </>
              )}
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#141413] text-white text-xs font-bold hover:bg-[#2C2A27] cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>로그아웃</span>
            </button>
          </div>
        </header>

        {/* Toast Notification Banner */}
        {toast && (
          <div
            className={`mb-5 rounded-2xl px-4 py-3 text-xs font-bold flex items-center justify-between ${
              toast.type === 'error'
                ? 'bg-rose-100 text-rose-800'
                : toast.type === 'success'
                ? 'bg-[#C6F0DF] text-[#065F46]'
                : 'bg-[#DDD5F8] text-[#3730A3]'
            }`}
          >
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="text-xs underline ml-4 cursor-pointer"
            >
              닫기
            </button>
          </div>
        )}

        {/* 3-Column Desktop Layout */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Left Vertical Navigation Rail */}
          <nav
            aria-label="주요 메뉴"
            className="w-full lg:w-52 bg-[#F3EFEA] rounded-[28px] p-3 flex lg:flex-col justify-between gap-2 overflow-x-auto no-scrollbar shrink-0"
          >
            <div className="flex lg:flex-col gap-1.5 w-full">
              {isTeacherMode
                ? teacherNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = teacherTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setTeacherTab(item.id)}
                        className={`flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-[#141413] text-white shadow-xs'
                            : 'text-[#4A463F] hover:bg-white/80 hover:text-[#141413]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{item.label}</span>
                        </div>
                        {item.badge ? (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums ${
                              active
                                ? 'bg-white text-[#141413]'
                                : 'bg-rose-500 text-white'
                            }`}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                : studentNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = studentTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setStudentTab(item.id)}
                        className={`flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-[#141413] text-white shadow-xs'
                            : 'text-[#4A463F] hover:bg-white/80 hover:text-[#141413]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{item.label}</span>
                        </div>
                        {item.badge ? (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums ${
                              active
                                ? 'bg-white text-[#141413]'
                                : 'bg-rose-500 text-white'
                            }`}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
            </div>

            {/* Bottom Avatar in Left Rail */}
            <div className="hidden lg:flex items-center gap-2.5 pt-4 mt-4 border-t border-[#E2DDD3] px-2">
              <AvatarIllustration avatarId={activeUser.avatarId} size="sm" />
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[#141413] truncate">
                  {activeUser.displayName}
                </p>
                <p className="text-[10px] text-[#6B665E] truncate">
                  {isTeacherMode ? '교사 관리자' : '5학년 2반 학생'}
                </p>
              </div>
            </div>
          </nav>

          {/* Center Main Viewport */}
          <main className="flex-1 min-w-0 w-full">
            {isTeacherMode ? (
              <TeacherViews
                activeTab={teacherTab}
                workspaceOwnerUid={WORKSPACE_ID}
                teacherProfile={activeUser}
                allUsers={allUsers}
                missions={missions}
                submissions={submissions}
                ledger={ledger}
                stats={stats}
                badges={badges}
                badgeAwards={badgeAwards}
                assignments={assignments}
                letters={letters}
                loungeSession={currentLoungeSession}
                loungeParticipants={loungeParticipants}
                loungeMessages={loungeMessages}
                reports={reports}
                auditLogs={auditLogs}
                appSettings={appSettingsList[0] || null}
                onNavigate={(tab) => setTeacherTab(tab)}
                onNotify={showToast}
              />
            ) : (
              <StudentViews
                activeTab={studentTab}
                workspaceOwnerUid={WORKSPACE_ID}
                currentStudent={activeUser}
                allUsers={allUsers}
                missions={missions}
                submissions={submissions}
                ledger={ledger}
                stats={stats}
                badges={badges}
                badgeAwards={badgeAwards}
                assignments={assignments}
                letterThreads={letterThreads}
                letters={letters}
                loungeSession={currentLoungeSession}
                loungeParticipants={loungeParticipants}
                loungeMessages={loungeMessages}
                appSettings={appSettingsList[0] || null}
                onNavigate={(tab) => setStudentTab(tab)}
                onNotify={showToast}
              />
            )}
          </main>

          {/* Right Summary Widget Panel */}
          {rightPanelOpen && (
            <div className="w-full lg:w-80 xl:w-84 shrink-0">
              <RightSummaryPanel
                activeUser={activeUser}
                allUsers={allUsers}
                missions={missions}
                submissions={submissions}
                stats={stats}
                badges={badges}
                badgeAwards={badgeAwards}
                letters={letters}
                loungeSession={currentLoungeSession}
                loungeParticipants={loungeParticipants}
                onStudentNavigate={(tab) => setStudentTab(tab)}
                onTeacherNavigate={(tab) => setTeacherTab(tab)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Password Change Modal (Works for both Teacher and Student) */}
      {pwModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handlePasswordChangeSubmit}
            className="bg-[#FBF9F5] border border-[#E6E1D6] rounded-[32px] max-w-md w-full p-6 sm:p-8 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-[#141413]">
                {isTeacherMode
                  ? '🔒 교사 관리자 아이디 / 비밀번호 변경'
                  : `🔒 ${activeUser.displayName} 학생 비밀번호 변경`}
              </h2>
              <button
                type="button"
                onClick={() => setPwModalOpen(false)}
                className="px-3 py-1 rounded-xl bg-[#EFECE6] text-xs font-bold text-[#141413] cursor-pointer"
              >
                닫기
              </button>
            </div>

            <p className="text-xs text-[#5C574F] leading-relaxed">
              {isTeacherMode
                ? '다른 사람이 교사 대시보드에 들어오지 못하도록 관리자 아이디와 비밀번호를 안전하게 변경할 수 있습니다.'
                : '다른 친구가 내 계정으로 들어오지 못하도록 나만의 비밀번호로 변경해 보세요.'}
            </p>

            {isTeacherMode && (
              <div>
                <label className="block text-xs font-bold text-[#141413] mb-1">
                  교사 관리자 로그인 아이디
                </label>
                <input
                  type="text"
                  value={modalAdminId}
                  onChange={(e) => setModalAdminId(e.target.value)}
                  required
                  className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2.5 text-sm font-bold text-[#141413]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#141413] mb-1">
                현재 비밀번호
              </label>
              <input
                type="password"
                value={modalCurrentPw}
                onChange={(e) => setModalCurrentPw(e.target.value)}
                placeholder="현재 비밀번호 입력"
                required
                className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2.5 text-sm text-[#141413]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#141413] mb-1">
                새 비밀번호 (4자리 이상)
              </label>
              <input
                type="password"
                value={modalNewPw}
                onChange={(e) => setModalNewPw(e.target.value)}
                placeholder="새 비밀번호 입력"
                required
                className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2.5 text-sm text-[#141413]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#141413] mb-1">
                새 비밀번호 확인
              </label>
              <input
                type="password"
                value={modalConfirmPw}
                onChange={(e) => setModalConfirmPw(e.target.value)}
                placeholder="새 비밀번호 다시 입력"
                required
                className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2.5 text-sm text-[#141413]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPwModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-[#EFECE6] text-xs font-bold text-[#141413] cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={modalSaving}
                className="px-5 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-bold hover:bg-[#2C2A27] cursor-pointer"
              >
                {modalSaving ? '변경 중...' : '비밀번호 변경 저장'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
