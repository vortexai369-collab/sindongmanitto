import React, { useState, useEffect, useMemo } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
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
  HeartHandshake,
  PanelRightClose,
  PanelRightOpen,
  Lock,
  KeyRound,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
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
} from './services/manittoServerEngine';
import { AvatarIllustration } from './components/AvatarIllustration';
import { StudentViews } from './components/StudentViews';
import { TeacherViews } from './components/TeacherViews';
import { RightSummaryPanel } from './components/RightSummaryPanel';

export default function App() {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Login Screen State (Supports Teacher Login & Student ID/Password Adapter)
  const [loginRoleTab, setLoginRoleTab] = useState<'student' | 'teacher'>('student');
  const [loginStudentId, setLoginStudentId] = useState('shindong01');
  const [loginPassword, setLoginPassword] = useState('1234');
  const [loginError, setLoginError] = useState('');
  const [pendingLoginTargetId, setPendingLoginTargetId] = useState<string | null>(null);

  // Active Profile inside the Classroom Workspace
  const [activeProfileUid, setActiveProfileUid] = useState<string>('');
  const [studentTab, setStudentTab] = useState<StudentNavTab>('home');
  const [teacherTab, setTeacherTab] = useState<TeacherNavTab>('dashboard');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

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

  // 1. Firebase Auth State Listener & Initial Classroom Seed
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        setSeeding(true);
        try {
          await ensureWorkspaceSeeded(user.uid);
        } catch (err) {
          console.error('Seed error:', err);
        } finally {
          setSeeding(false);
        }
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2. Real-time Firestore Listeners (Scoped strictly by workspaceOwnerUid == authUser.uid)
  useEffect(() => {
    if (!authReady || !authUser || seeding) return;
    const ownerUid = authUser.uid;

    const unsubs: Array<() => void> = [];

    const subscribeCol = <T,>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>
    ) => {
      const q = query(
        collection(db, colName),
        where('workspaceOwnerUid', '==', ownerUid)
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
  }, [authReady, authUser, seeding]);

  // 3. Subscribe to Lounge Participants subcollection for the active lounge session
  const currentLoungeSession = loungeSessions[0] || null;
  useEffect(() => {
    if (!authReady || !authUser || !currentLoungeSession) return;
    const subPath = `loungeSessions/${currentLoungeSession.sessionId}/participants`;
    const q = query(
      collection(db, 'loungeSessions', currentLoungeSession.sessionId, 'participants'),
      where('workspaceOwnerUid', '==', authUser.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLoungeParticipants(snap.docs.map((d) => d.data() as LoungeParticipant));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, subPath)
    );
    return () => unsub();
  }, [authReady, authUser, currentLoungeSession?.sessionId]);

  // 4. Resolve active profile after login
  useEffect(() => {
    if (allUsers.length === 0) return;

    if (pendingLoginTargetId) {
      const target = allUsers.find((u) => u.studentLoginId === pendingLoginTargetId);
      if (target) {
        setActiveProfileUid(target.uid);
        setPendingLoginTargetId(null);
        return;
      }
    }

    if (!activeProfileUid || !allUsers.some((u) => u.uid === activeProfileUid)) {
      const firstStudent =
        allUsers.find((u) => u.studentLoginId === 'shindong01') ||
        allUsers.find((u) => u.role === 'student') ||
        allUsers[0];
      if (firstStudent) {
        setActiveProfileUid(firstStudent.uid);
      }
    }
  }, [allUsers, activeProfileUid, pendingLoginTargetId]);

  const activeUser = useMemo(
    () => allUsers.find((u) => u.uid === activeProfileUid) || allUsers[0] || null,
    [allUsers, activeProfileUid]
  );

  // 5. Real-time Session Heartbeat (Distinguishes login vs live online presence)
  useEffect(() => {
    if (!authUser || !activeUser) return;
    const sendBeat = async () => {
      try {
        await updateDoc(doc(db, 'users', activeUser.uid), {
          lastHeartbeatAt: new Date().toISOString(),
          isOnlineSession: true,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore transient network beat errors
      }
    };
    sendBeat();
    const timer = setInterval(sendBeat, 60 * 1000);
    return () => clearInterval(timer);
  }, [authUser, activeUser?.uid]);

  // Login Handlers
  const handleGoogleLogin = async (targetLoginId?: string) => {
    setLoginError('');
    try {
      if (targetLoginId) {
        setPendingLoginTargetId(targetLoginId);
      }
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setLoginError(
        err instanceof Error
          ? `Google 로그인 창이 닫혔거나 취소되었습니다: ${err.message}`
          : '로그인 중 오류가 발생했습니다.'
      );
    }
  };

  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const trimmedId = loginStudentId.trim();
    const trimmedPw = loginPassword.trim();

    if (!trimmedId || !trimmedPw) {
      setLoginError('아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }

    // If not yet authenticated with Firebase Auth, sign in via Google Popup first to establish verified token
    if (!authUser) {
      await handleGoogleLogin(trimmedId);
      return;
    }

    const foundUser = allUsers.find((u) => u.studentLoginId === trimmedId);
    if (!foundUser) {
      setLoginError('존재하지 않는 아이디입니다. 담임선생님께 발급받은 아이디를 확인해 주세요.');
      return;
    }
    if (foundUser.accountStatus === 'inactive') {
      setLoginError('비활성화된 계정입니다. 담임선생님께 계정 복구를 요청해 주세요.');
      return;
    }

    const inputHash = await hashPassword(trimmedPw);
    if (foundUser.passwordHash !== inputHash) {
      setLoginError('비밀번호가 일치하지 않습니다. (초기 비밀번호는 1234 입니다)');
      return;
    }

    await updateDoc(doc(db, 'users', foundUser.uid), {
      lastLoginAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      isOnlineSession: true,
      updatedAt: serverTimestamp(),
    });
    setActiveProfileUid(foundUser.uid);
    showToast(`${foundUser.displayName}님, 전주신동초 마니또에 오신 것을 환영해요!`, 'success');
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
    await signOut(auth);
    setActiveProfileUid('');
  };

  // Loading Screen
  if (!authReady || seeding) {
    return (
      <div className="min-h-screen bg-[#E2F2EA] flex items-center justify-center p-6">
        <div className="bg-[#FBF9F5] rounded-[36px] p-10 max-w-md w-full text-center shadow-sm space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#C6F0DF] flex items-center justify-center mx-auto text-2xl">
            🌱
          </div>
          <h1 className="text-xl font-extrabold text-[#141413]">전주신동초 마니또</h1>
          <p className="text-xs text-[#6B665E]">
            안전한 학급 데이터베이스와 마니또 공간을 불러오고 있어요...
          </p>
        </div>
      </div>
    );
  }

  // Unauthenticated Login Page (Page 1 of 22)
  if (!authUser || !activeUser) {
    return (
      <div className="min-h-screen bg-[#E2F2EA] flex items-center justify-center p-4 sm:p-8">
        <div className="bg-[#FBF9F5] rounded-[40px] max-w-4xl w-full p-6 sm:p-10 shadow-sm grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Intro Column */}
          <div className="lg:col-span-6 space-y-5">
            <div className="inline-flex items-center gap-2 bg-[#F3EFEA] rounded-2xl px-3.5 py-2 text-xs font-bold text-[#141413]">
              <span>🏫 전주신동초등학교 공식 학급 활동 플랫폼</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#141413] tracking-tight leading-tight">
              나의 따뜻한 행동이
              <br />
              우리 반을 바꿔요!
            </h1>

            <p className="text-xs sm:text-sm text-[#5C574F] leading-relaxed">
              <strong>「전주신동초 마니또」</strong>는 친구의 장점을 발견하고, 작은 친절 미션 20개를 실천하며, 익명 편지함과 실시간 학급 라운지로 마음을 나누는 안전한 공간입니다.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
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
          <div className="lg:col-span-6 bg-[#F3EFEA] rounded-[32px] p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setLoginRoleTab('student');
                  setLoginStudentId('shindong01');
                  setLoginPassword('1234');
                }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${
                  loginRoleTab === 'student'
                    ? 'bg-[#141413] text-white'
                    : 'text-[#5C574F]'
                }`}
              >
                🎒 학생 로그인
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginRoleTab('teacher');
                  setLoginStudentId('teacher');
                  setLoginPassword('1234');
                }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${
                  loginRoleTab === 'teacher'
                    ? 'bg-[#141413] text-white'
                    : 'text-[#5C574F]'
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

            <form onSubmit={handleCredentialLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#141413] mb-1">
                  {loginRoleTab === 'student'
                    ? '선생님이 발급한 학생 아이디'
                    : '교사 관리자 아이디'}
                </label>
                <input
                  type="text"
                  value={loginStudentId}
                  onChange={(e) => setLoginStudentId(e.target.value)}
                  placeholder={loginRoleTab === 'student' ? 'shindong01' : 'teacher'}
                  className="w-full rounded-xl bg-white px-4 py-2.5 text-sm text-[#141413] font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#141413] mb-1">
                  비밀번호 (초기 비밀번호: 1234)
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full rounded-xl bg-white px-4 py-2.5 text-sm text-[#141413]"
                />
              </div>

              {/* Quick Demo Account Selector */}
              {loginRoleTab === 'student' && (
                <div>
                  <span className="block text-[11px] font-bold text-[#6B665E] mb-1.5">
                    빠른 학생 계정 선택 (클릭 시 아이디 자동 입력):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'shindong01', name: '김하늘' },
                      { id: 'shindong02', name: '이준서' },
                      { id: 'shindong03', name: '박소율' },
                      { id: 'shindong04', name: '최도윤' },
                      { id: 'shindong05', name: '정지우' },
                      { id: 'shindong06', name: '강시우' },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setLoginStudentId(s.id);
                          setLoginPassword('1234');
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                          loginStudentId === s.id
                            ? 'bg-[#141413] text-white'
                            : 'bg-white text-[#141413]'
                        }`}
                      >
                        {s.name} ({s.id})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-[#141413] text-white text-xs font-extrabold hover:bg-[#2C2A27] cursor-pointer shadow-xs"
              >
                {loginRoleTab === 'student'
                  ? '학생 계정으로 로그인 시작하기 (Google 보안 인증 연동)'
                  : '교사 관리자로 로그인 시작하기 (Google 보안 인증 연동)'}
              </button>
            </form>

            <p className="text-[11px] text-[#6B665E] leading-relaxed text-center">
              비밀번호를 잊어버린 학생은 담임선생님께 요청하면 교사 대시보드에서 즉시 초기 비밀번호(1234)로 안전하게 복구할 수 있습니다.
            </p>
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
    { id: 'settings', label: '설정', icon: Settings },
  ];

  const teacherNavItems: Array<{
    id: TeacherNavTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'dashboard', label: '교사 홈', icon: ShieldCheck },
    { id: 'students', label: '학생 계정 관리', icon: Users },
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
    { id: 'settings', label: '설정·감사로그', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#E2F2EA] p-2 sm:p-4 lg:p-6">
      {/* Main Outer App Container (Matches Reference Image Ivory Canvas Frame) */}
      <div className="max-w-[1440px] mx-auto bg-[#FBF9F5] rounded-[36px] shadow-xs border border-white/80 p-4 sm:p-6">
        {/* Top Role & Account Switcher Bar (Follows 3-Zone Top Bar Contract) */}
        <header className="flex items-center justify-between gap-4 pb-4 mb-5 border-b border-[#EFECE6]">
          {/* Zone 1: Single Brand Wordmark */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-[#141413] text-white flex items-center justify-center font-extrabold text-sm">
              신
            </div>
            <span className="text-base sm:text-lg font-extrabold tracking-tight text-[#141413] whitespace-nowrap shrink-0">
              전주신동초 마니또
            </span>
          </div>

          {/* Zone 2: Quick Classroom Account Switcher (Allows testing Teacher & all 6 Students seamlessly) */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-xs font-bold text-[#6B665E] whitespace-nowrap shrink-0 hidden md:inline">
              현재 접속 계정 전환:
            </span>
            <select
              value={activeUser.uid}
              onChange={(e) => setActiveProfileUid(e.target.value)}
              aria-label="현재 접속 계정 선택"
              className="rounded-xl bg-[#F3EFEA] px-3 py-1.5 text-xs font-bold text-[#141413] cursor-pointer"
            >
              {allUsers
                .slice()
                .sort((a, b) => (a.role === 'teacher' ? -1 : b.role === 'teacher' ? 1 : a.displayName.localeCompare(b.displayName)))
                .map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.role === 'teacher'
                      ? `👩‍🏫 [교사 관리자] ${u.displayName}`
                      : `🎒 [학생] ${u.displayName} (${u.studentLoginId})`}
                  </option>
                ))}
            </select>
          </div>

          {/* Zone 3: Primary Action (Toggle Right Panel / Logout) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setRightPanelOpen((v) => !v)}
              className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F3EFEA] text-xs font-bold text-[#141413] hover:bg-[#E7E2D8] cursor-pointer whitespace-nowrap shrink-0"
            >
              {rightPanelOpen ? (
                <>
                  <PanelRightClose className="w-3.5 h-3.5" />
                  <span>우측 요약 접기</span>
                </>
              ) : (
                <>
                  <PanelRightOpen className="w-3.5 h-3.5" />
                  <span>우측 요약 열기</span>
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

        {/* 3-Column Desktop Layout (Left Vertical Nav Rail + Center Main + Right Widget Panel) */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Left Vertical Navigation Rail (Matches Reference Image Rounded Capsule Rail) */}
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
                workspaceOwnerUid={authUser.uid}
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
                workspaceOwnerUid={authUser.uid}
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
    </div>
  );
}
