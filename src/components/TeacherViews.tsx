import React, { useState, useMemo } from 'react';
import {
  Users,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Plus,
  Shuffle,
  Eye,
  EyeOff,
  Trash2,
  Award,
  TrendingUp,
  Search,
  Settings,
  FileText,
  UserPlus,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  UserProfile,
  Mission,
  MissionSubmission,
  ScoreLedger,
  StudentStats,
  Badge,
  BadgeAward,
  ManittoAssignment,
  Letter,
  LoungeSession,
  LoungeParticipant,
  LoungeMessage,
  ReportRecord,
  AuditLog,
  AppSetting,
  TeacherNavTab,
  MissionCategory,
  MissionDifficulty,
} from '../types/manitto';
import { AVATAR_OPTIONS } from '../data/seedData';
import { AvatarIllustration } from './AvatarIllustration';
import {
  reviewMissionSubmission,
  adjustStudentScore,
  evaluateAndAwardBadges,
  recordAuditLog,
  hashPassword,
  sanitizeText,
  isUserCurrentlyOnline,
} from '../services/manittoServerEngine';

interface TeacherContextProps {
  workspaceOwnerUid: string;
  teacherProfile: UserProfile;
  allUsers: UserProfile[];
  missions: Mission[];
  submissions: MissionSubmission[];
  ledger: ScoreLedger[];
  stats: StudentStats[];
  badges: Badge[];
  badgeAwards: BadgeAward[];
  assignments: ManittoAssignment[];
  letters: Letter[];
  loungeSession: LoungeSession | null;
  loungeParticipants: LoungeParticipant[];
  loungeMessages: LoungeMessage[];
  reports: ReportRecord[];
  auditLogs: AuditLog[];
  appSettings: AppSetting | null;
  onNavigate: (tab: TeacherNavTab) => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const TeacherViews: React.FC<TeacherContextProps & { activeTab: TeacherNavTab }> = (
  props
) => {
  const { activeTab } = props;

  return (
    <div className="w-full">
      {activeTab === 'dashboard' && <TeacherDashboardOverview {...props} />}
      {activeTab === 'students' && <TeacherStudentsView {...props} />}
      {activeTab === 'activities' && <TeacherActivitiesView {...props} />}
      {activeTab === 'missions' && <TeacherMissionsView {...props} />}
      {activeTab === 'assignments' && <TeacherAssignmentsView {...props} />}
      {activeTab === 'reports' && <TeacherReportsView {...props} />}
      {activeTab === 'lounge' && <TeacherLoungeView {...props} />}
      {activeTab === 'stats' && <TeacherStatsView {...props} />}
      {activeTab === 'settings' && <TeacherSettingsAndAuditView {...props} />}
    </div>
  );
};

/* ============================================================================
 * 1. TEACHER OVERVIEW DASHBOARD (8 KPI Cards + Pending Approvals + Presence)
 * ========================================================================== */
const TeacherDashboardOverview: React.FC<TeacherContextProps> = ({
  workspaceOwnerUid,
  teacherProfile,
  allUsers,
  missions,
  submissions,
  ledger,
  stats,
  badges,
  badgeAwards,
  letters,
  loungeParticipants,
  reports,
  onNavigate,
  onNotify,
}) => {
  const students = useMemo(
    () => allUsers.filter((u) => u.role === 'student'),
    [allUsers]
  );
  const onlineStudents = useMemo(
    () => students.filter((s) => s.accountStatus === 'active' && isUserCurrentlyOnline(s)),
    [students]
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySubmissions = submissions.filter(
    (s) => s.activityDate === todayStr && s.status !== 'deleted'
  );
  const pendingSubmissions = submissions.filter((s) => s.status === 'pending');

  const todayPoints = ledger
    .filter((l) => l.activityDate === todayStr && l.pointsDelta > 0)
    .reduce((acc, cur) => acc + cur.pointsDelta, 0);

  const pendingReports = reports.filter((r) => r.status === 'pending');
  const waitingCount = loungeParticipants.filter((p) => p.presenceStatus === 'waiting').length;
  const activeCount = loungeParticipants.filter((p) => p.presenceStatus === 'active').length;

  const handleQuickReview = async (
    sub: MissionSubmission,
    decision: 'approved' | 'rejected'
  ) => {
    const mission = missions.find((m) => m.missionId === sub.missionId);
    if (!mission) return;
    try {
      await reviewMissionSubmission({
        workspaceOwnerUid,
        teacherUid: teacherProfile.uid,
        teacherName: teacherProfile.displayName,
        submission: sub,
        missionTitle: mission.title,
        missionPoints: mission.points,
        decision,
        reviewComment:
          decision === 'approved'
            ? '선생님이 확인하고 승인했어요! 참 잘했어요.'
            : '실천 내용을 조금 더 구체적으로 보완해 볼까요?',
      });

      if (decision === 'approved') {
        const updatedSubs = submissions.map((s) =>
          s.submissionId === sub.submissionId ? { ...s, status: 'approved' as const } : s
        );
        await evaluateAndAwardBadges({
          workspaceOwnerUid,
          studentUid: sub.studentUid,
          classId: sub.classId,
          missions,
          submissions: updatedSubs,
          sentLettersCount: letters.filter((l) => l.senderUid === sub.studentUid).length,
          badges,
          existingAwards: badgeAwards,
        });
      }

      onNotify(
        decision === 'approved'
          ? `미션 승인 완료! +${mission.points}점이 지급되었습니다.`
          : '미션을 반려 처리했습니다.',
        'success'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '처리 중 오류 발생', 'error');
    }
  };

  const kpiCards = [
    { label: '전체 학생 수', value: `${students.length}명`, bg: '#E0F2FE' },
    { label: '현재 실시간 접속 학생', value: `${onlineStudents.length}명`, bg: '#CCF3E4' },
    { label: '오늘 미션 제출 수', value: `${todaySubmissions.length}건`, bg: '#F6D4D2' },
    { label: '승인 대기 미션 수', value: `${pendingSubmissions.length}건`, bg: '#FBE3C8' },
    { label: '오늘 획득한 점수 합계', value: `+${todayPoints}점`, bg: '#DDD5F8' },
    { label: '미처리 안전 신고 수', value: `${pendingReports.length}건`, bg: '#FFE4E6' },
    { label: '라운지 대기 인원', value: `${waitingCount}명`, bg: '#FEF9C3' },
    { label: '라운지 참여 인원', value: `${activeCount}명`, bg: '#D1FAE5' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#6B665E] mb-1">
          전주신동초 5학년 2반 교사용 관리자 대시보드
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
          우리 반 마니또 운영 및 안전 현황
        </h1>
      </div>

      {/* 8 Top KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            style={{ backgroundColor: card.bg }}
            className="rounded-2xl p-4 flex flex-col justify-between"
          >
            <span className="text-xs font-bold text-[#3D3A35]">{card.label}</span>
            <strong className="text-2xl font-extrabold text-[#141413] mt-1.5 tabular-nums">
              {card.value}
            </strong>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Pending Mission Approvals */}
        <div className="lg:col-span-7 bg-[#F3EFEA] rounded-[28px] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#141413]">
              선생님 승인 대기 미션 ({pendingSubmissions.length}건)
            </h2>
            <button
              onClick={() => onNavigate('missions')}
              className="text-xs font-bold text-[#5C574F] hover:text-[#141413] cursor-pointer"
            >
              전체 미션 관리 →
            </button>
          </div>

          {pendingSubmissions.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center text-xs text-[#6B665E]">
              현재 승인 대기 중인 미션 기록이 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingSubmissions.map((sub) => {
                const stu = students.find((s) => s.uid === sub.studentUid);
                const mis = missions.find((m) => m.missionId === sub.missionId);
                return (
                  <div
                    key={sub.submissionId}
                    className="bg-white rounded-2xl p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#141413]">
                        {stu?.displayName || '학생'} · [{mis?.title || '미션'}] (+
                        {mis?.points || 10}점)
                      </span>
                      <span className="text-[11px] text-[#6B665E] tabular-nums">
                        실천일: {sub.activityDate}
                      </span>
                    </div>
                    <p className="text-xs text-[#3D3A35]">
                      <strong>실천 내용:</strong> {sub.actionDescription}
                    </p>
                    <p className="text-xs text-[#5C574F]">
                      <strong>소감:</strong> {sub.reflection}
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => handleQuickReview(sub, 'rejected')}
                        className="px-3 py-1.5 rounded-xl bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer"
                      >
                        반려
                      </button>
                      <button
                        onClick={() => handleQuickReview(sub, 'approved')}
                        className="px-3.5 py-1.5 rounded-xl bg-[#141413] text-white text-xs font-bold cursor-pointer"
                      >
                        승인 및 점수 지급
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Student Session & Heartbeat Monitor */}
        <div className="lg:col-span-5 bg-[#F3EFEA] rounded-[28px] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#141413]">
              학생 접속 현황 (로그인 vs 실시간 활성)
            </h2>
            <button
              onClick={() => onNavigate('students')}
              className="text-xs font-bold text-[#5C574F] hover:text-[#141413] cursor-pointer"
            >
              학생 관리 →
            </button>
          </div>

          <div className="space-y-2.5">
            {students.map((stu) => {
              const online = isUserCurrentlyOnline(stu);
              const st = stats.find((x) => x.studentUid === stu.uid);
              return (
                <div
                  key={stu.uid}
                  className="bg-white rounded-2xl p-3.5 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-3">
                    <AvatarIllustration avatarId={stu.avatarId} size="sm" />
                    <div>
                      <p className="text-xs font-extrabold text-[#141413]">
                        {stu.displayName}{' '}
                        <span className="font-normal text-[#6B665E]">
                          ({stu.studentLoginId})
                        </span>
                      </p>
                      <p className="text-[11px] text-[#6B665E] tabular-nums">
                        최근 활동: {stu.lastHeartbeatAt ? stu.lastHeartbeatAt.slice(11, 16) : '-'} · 누적{' '}
                        {st?.totalPoints ?? 0}점
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-xl ${
                      stu.accountStatus === 'inactive'
                        ? 'bg-rose-100 text-rose-700'
                        : online
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-[#EFECE6] text-[#6B665E]'
                    }`}
                  >
                    {stu.accountStatus === 'inactive'
                      ? '비활성화됨'
                      : online
                      ? '실시간 접속 중'
                      : '오프라인 (세션 만료)'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 2. TEACHER STUDENT ACCOUNT & SCORE MANAGEMENT VIEW
 * ========================================================================== */
const TeacherStudentsView: React.FC<TeacherContextProps> = ({
  workspaceOwnerUid,
  teacherProfile,
  allUsers,
  stats,
  assignments,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'points' | 'missions'>('name');

  // Create student state
  const [newName, setNewName] = useState('');
  const [newLoginId, setNewLoginId] = useState('');
  const [newPassword, setNewPassword] = useState('1234');
  const [creating, setCreating] = useState(false);

  // Score adjustment modal state
  const [adjustingStudent, setAdjustingStudent] = useState<UserProfile | null>(null);
  const [pointsDelta, setPointsDelta] = useState<number>(5);
  const [adjustReason, setAdjustReason] = useState('');

  const students = useMemo(() => {
    return allUsers
      .filter((u) => u.role === 'student')
      .filter((u) => {
        if (statusFilter !== 'all' && u.accountStatus !== statusFilter) return false;
        if (
          searchQuery.trim() &&
          !u.displayName.includes(searchQuery.trim()) &&
          !u.studentLoginId.includes(searchQuery.trim())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const stA = stats.find((x) => x.studentUid === a.uid);
        const stB = stats.find((x) => x.studentUid === b.uid);
        if (sortBy === 'points') return (stB?.totalPoints ?? 0) - (stA?.totalPoints ?? 0);
        if (sortBy === 'missions')
          return (stB?.completedMissionCount ?? 0) - (stA?.completedMissionCount ?? 0);
        return a.displayName.localeCompare(b.displayName);
      });
  }, [allUsers, stats, statusFilter, searchQuery, sortBy]);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    const cleanId = newLoginId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (cleanId.length < 3) {
      onNotify('학생 로그인 아이디는 영문/숫자 3자 이상으로 입력해 주세요.', 'error');
      return;
    }
    if (allUsers.some((u) => u.studentLoginId === cleanId)) {
      onNotify('이미 사용 중인 학생 아이디입니다.', 'error');
      return;
    }

    setCreating(true);
    const prefix = workspaceOwnerUid.slice(0, 8);
    const uid = `${prefix}_stu_${Date.now()}`;
    const nowIso = new Date().toISOString();

    try {
      const pwHash = await hashPassword(newPassword || '1234');
      await setDoc(doc(db, 'users', uid), {
        uid,
        workspaceOwnerUid,
        role: 'student',
        studentLoginId: cleanId,
        passwordHash: pwHash,
        displayName: sanitizeText(newName, 60),
        classId: teacherProfile.classId,
        avatarId: AVATAR_OPTIONS[Math.floor(Math.random() * 6)].id,
        bio: '새로 등록된 전주신동초 친구예요!',
        interests: ['독서'],
        hobbies: ['일기 쓰기'],
        favoriteFood: '',
        strengths: '',
        cheerWanted: '',
        profileVisibility: 'manitto',
        accountStatus: 'active',
        lastLoginAt: nowIso,
        lastHeartbeatAt: nowIso,
        isOnlineSession: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'studentStats', uid), {
        studentUid: uid,
        workspaceOwnerUid,
        classId: teacherProfile.classId,
        totalPoints: 0,
        completedMissionCount: 0,
        earnedBadgeCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await recordAuditLog({
        workspaceOwnerUid,
        actorUid: teacherProfile.uid,
        actorName: teacherProfile.displayName,
        action: 'STUDENT_CREATED',
        targetType: 'user',
        targetId: uid,
        reason: '신규 학생 계정 발급',
        metadataSummary: `${newName} (${cleanId}) 학생 계정 생성 완료`,
      });

      setNewName('');
      setNewLoginId('');
      onNotify(`${newName} (${cleanId}) 학생 계정이 생성되었습니다!`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '계정 생성 오류', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleAccountStatus = async (stu: UserProfile) => {
    const nextStatus = stu.accountStatus === 'active' ? 'inactive' : 'active';
    const reason =
      nextStatus === 'inactive'
        ? '교사에 의한 학생 계정 비활성화 (데이터 보존 정책 적용)'
        : '교사에 의한 학생 계정 복구 및 활성화';

    try {
      await updateDoc(doc(db, 'users', stu.uid), {
        accountStatus: nextStatus,
        updatedAt: serverTimestamp(),
      });

      await recordAuditLog({
        workspaceOwnerUid,
        actorUid: teacherProfile.uid,
        actorName: teacherProfile.displayName,
        action: nextStatus === 'inactive' ? 'STUDENT_DEACTIVATED' : 'STUDENT_RECOVERED',
        targetType: 'user',
        targetId: stu.uid,
        reason,
        metadataSummary: `${stu.displayName} 계정 상태 -> ${nextStatus}`,
      });

      onNotify(
        `${stu.displayName} 학생 계정이 ${
          nextStatus === 'active' ? '복구(활성화)' : '비활성화'
        }되었습니다.`,
        'info'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${stu.uid}`);
    }
  };

  const handleResetStudentPassword = async (stu: UserProfile) => {
    try {
      const pwHash = await hashPassword('1234');
      await updateDoc(doc(db, 'users', stu.uid), {
        passwordHash: pwHash,
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        workspaceOwnerUid,
        actorUid: teacherProfile.uid,
        actorName: teacherProfile.displayName,
        action: 'PASSWORD_RESET',
        targetType: 'user',
        targetId: stu.uid,
        reason: '학생 요청에 따른 초기 비밀번호(1234) 복구',
        metadataSummary: `${stu.displayName} (${stu.studentLoginId}) 초기 비밀번호 복구`,
      });
      onNotify(`${stu.displayName} 학생의 비밀번호가 초기값(1234)으로 복구되었습니다.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${stu.uid}`);
    }
  };

  const handleScoreAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingStudent) return;
    try {
      await adjustStudentScore({
        workspaceOwnerUid,
        teacherUid: teacherProfile.uid,
        teacherName: teacherProfile.displayName,
        studentUid: adjustingStudent.uid,
        studentName: adjustingStudent.displayName,
        classId: adjustingStudent.classId,
        pointsDelta,
        reason: adjustReason,
      });
      setAdjustingStudent(null);
      setAdjustReason('');
      onNotify('학생 점수가 원장에 반영되고 감사 로그에 기록되었습니다.', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '점수 조정 실패', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#6B665E] mb-1">
          학생 계정 생성 · 비활성화/복구 · 점수 원장 조정
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
          우리 반 학생 계정 및 활동 관리
        </h1>
      </div>

      {/* Create New Student Form */}
      <form
        onSubmit={handleCreateStudent}
        className="bg-[#E0F2FE] rounded-[28px] p-6 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
      >
        <div>
          <label className="block text-xs font-bold text-[#141413] mb-1">신규 학생 이름</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="예: 홍길동"
            required
            className="w-full rounded-xl bg-white px-3.5 py-2 text-xs text-[#141413]"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#141413] mb-1">
            학생 발급 아이디 (영문/숫자)
          </label>
          <input
            type="text"
            value={newLoginId}
            onChange={(e) => setNewLoginId(e.target.value)}
            placeholder="예: shindong07"
            required
            className="w-full rounded-xl bg-white px-3.5 py-2 text-xs text-[#141413]"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#141413] mb-1">초기 비밀번호</label>
          <input
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className="w-full rounded-xl bg-white px-3.5 py-2 text-xs text-[#141413]"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-bold cursor-pointer"
        >
          + 학생 계정 발급하기
        </button>
      </form>

      {/* Search & Sort Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="이름 또는 아이디 검색..."
            className="rounded-xl bg-[#F3EFEA] px-3.5 py-2 text-xs text-[#141413]"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-xl bg-[#F3EFEA] px-3 py-2 text-xs font-bold text-[#141413]"
          >
            <option value="all">전체 상태</option>
            <option value="active">활성 계정만</option>
            <option value="inactive">비활성 계정만</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6B665E]">정렬:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-xl bg-[#F3EFEA] px-3 py-2 text-xs font-bold text-[#141413]"
          >
            <option value="name">이름순</option>
            <option value="points">누적 점수순</option>
            <option value="missions">완료 미션순</option>
          </select>
        </div>
      </div>

      {/* Student Table */}
      <div className="bg-[#F3EFEA] rounded-[28px] p-6 overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[720px]">
          <thead>
            <tr className="border-b border-[#E2DDD3] text-xs text-[#6B665E]">
              <th className="py-3 px-3">학생 (아이디)</th>
              <th className="py-3 px-3">접속 상태</th>
              <th className="py-3 px-3">누적 점수</th>
              <th className="py-3 px-3">완료 미션 / 뱃지</th>
              <th className="py-3 px-3">프로필 공개</th>
              <th className="py-3 px-3 text-right">교사 관리 작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2DDD3] text-xs">
            {students.map((stu) => {
              const st = stats.find((x) => x.studentUid === stu.uid);
              const online = isUserCurrentlyOnline(stu);
              return (
                <tr key={stu.uid} className="bg-white/60">
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-2.5">
                      <AvatarIllustration avatarId={stu.avatarId} size="sm" />
                      <div>
                        <p className="font-extrabold text-[#141413]">{stu.displayName}</p>
                        <p className="text-[11px] text-[#6B665E]">ID: {stu.studentLoginId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <span
                      className={`font-bold ${
                        stu.accountStatus === 'inactive'
                          ? 'text-rose-600'
                          : online
                          ? 'text-emerald-700'
                          : 'text-[#6B665E]'
                      }`}
                    >
                      {stu.accountStatus === 'inactive'
                        ? '비활성 계정'
                        : online
                        ? '실시간 접속 중'
                        : '오프라인'}
                    </span>
                    <p className="text-[10px] text-[#787268] tabular-nums">
                      로그인: {stu.lastLoginAt ? stu.lastLoginAt.slice(0, 10) : '-'}
                    </p>
                  </td>
                  <td className="py-3.5 px-3 font-extrabold text-[#141413] tabular-nums">
                    {st?.totalPoints ?? 0}점
                  </td>
                  <td className="py-3.5 px-3 tabular-nums text-[#3D3A35]">
                    미션 {st?.completedMissionCount ?? 0}회 · 뱃지 {st?.earnedBadgeCount ?? 0}개
                  </td>
                  <td className="py-3.5 px-3 text-[#5C574F]">
                    {stu.profileVisibility === 'private'
                      ? '나만 보기'
                      : stu.profileVisibility === 'manitto'
                      ? '마니또 공개'
                      : '학급 공개'}
                  </td>
                  <td className="py-3.5 px-3 text-right space-x-1.5">
                    <button
                      onClick={() => setAdjustingStudent(stu)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#FBE3C8] text-[#141413] font-bold cursor-pointer"
                    >
                      점수 조정
                    </button>
                    <button
                      onClick={() => handleResetStudentPassword(stu)}
                      className="px-2.5 py-1.5 rounded-lg bg-white text-[#141413] font-bold cursor-pointer"
                    >
                      비밀번호 복구
                    </button>
                    <button
                      onClick={() => handleToggleAccountStatus(stu)}
                      className={`px-2.5 py-1.5 rounded-lg font-bold cursor-pointer ${
                        stu.accountStatus === 'active'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {stu.accountStatus === 'active' ? '비활성화' : '계정 복구'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Score Adjustment Modal */}
      {adjustingStudent && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleScoreAdjustmentSubmit}
            className="bg-[#FBF9F5] rounded-[28px] max-w-md w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-extrabold text-[#141413]">
              {adjustingStudent.displayName} 학생 점수 조정
            </h3>
            <p className="text-xs text-[#5C574F]">
              점수 조정 내역과 사유는 점수 원장(ScoreLedger) 및 감사 로그(AuditLogs)에 영구 기록됩니다.
            </p>
            <div>
              <label className="block text-xs font-bold text-[#141413] mb-1">
                변동 점수 (예: +10 또는 -5)
              </label>
              <input
                type="number"
                value={pointsDelta}
                onChange={(e) => setPointsDelta(Number(e.target.value))}
                required
                className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#141413] mb-1">
                조정 사유 (필수 입력)
              </label>
              <input
                type="text"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="예: 학급 대청소 특별 봉사 활동 가산점 부여"
                required
                className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdjustingStudent(null)}
                className="px-4 py-2 rounded-xl bg-[#EFECE6] text-xs font-bold cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#141413] text-white text-xs font-bold cursor-pointer"
              >
                원장 반영 및 저장
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 3. TEACHER STUDENT ACTIVITY & MISSION HISTORY VIEW
 * ========================================================================== */
const TeacherActivitiesView: React.FC<TeacherContextProps> = ({
  workspaceOwnerUid,
  teacherProfile,
  allUsers,
  missions,
  submissions,
  onNotify,
}) => {
  const [selectedStudentUid, setSelectedStudentUid] = useState<string>('all');
  const [deleteReason, setDeleteReason] = useState('');
  const [deletingSub, setDeletingSub] = useState<MissionSubmission | null>(null);

  const students = allUsers.filter((u) => u.role === 'student');

  const filteredSubs = useMemo(() => {
    return submissions
      .filter((s) => (selectedStudentUid === 'all' ? true : s.studentUid === selectedStudentUid))
      .sort((a, b) => b.activityDate.localeCompare(a.activityDate));
  }, [submissions, selectedStudentUid]);

  const handleDeleteSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingSub) return;
    const mis = missions.find((m) => m.missionId === deletingSub.missionId);
    try {
      await reviewMissionSubmission({
        workspaceOwnerUid,
        teacherUid: teacherProfile.uid,
        teacherName: teacherProfile.displayName,
        submission: deletingSub,
        missionTitle: mis?.title || '미션',
        missionPoints: mis?.points || 0,
        decision: 'deleted',
        reviewComment: deleteReason || '부적절하거나 중복된 활동 기록 삭제',
      });
      setDeletingSub(null);
      setDeleteReason('');
      onNotify('활동 기록이 삭제 처리되고 지급되었던 점수가 원장에서 자동 회수되었습니다.', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '삭제 실패', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#6B665E] mb-1">
            학생별 실천 기록 열람 및 부적절 기록 삭제(점수 자동 회수)
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
            학생별 미션 실천 기록 관리
          </h1>
        </div>

        <select
          value={selectedStudentUid}
          onChange={(e) => setSelectedStudentUid(e.target.value)}
          className="rounded-xl bg-[#F3EFEA] px-4 py-2.5 text-xs font-bold text-[#141413]"
        >
          <option value="all">전체 학생 기록 보기</option>
          {students.map((s) => (
            <option key={s.uid} value={s.uid}>
              {s.displayName} ({s.studentLoginId})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {filteredSubs.map((sub) => {
          const stu = students.find((s) => s.uid === sub.studentUid);
          const mis = missions.find((m) => m.missionId === sub.missionId);
          return (
            <div
              key={sub.submissionId}
              className="bg-[#F3EFEA] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <strong className="font-extrabold text-[#141413]">
                    {stu?.displayName || '학생'}
                  </strong>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-[#3D3A35]">{mis?.title}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#6B665E] tabular-nums">{sub.activityDate}</span>
                </div>
                <p className="text-xs text-[#141413]">
                  <strong>실천 행동:</strong> {sub.actionDescription}
                </p>
                <p className="text-xs text-[#5C574F]">
                  <strong>실천 소감:</strong> {sub.reflection}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="px-3 py-1 rounded-xl bg-white text-xs font-bold text-[#141413] tabular-nums">
                  {sub.status === 'approved'
                    ? `승인됨 (+${sub.awardedPoints}점)`
                    : sub.status === 'pending'
                    ? '승인 대기'
                    : sub.status === 'deleted'
                    ? '삭제됨(점수 회수)'
                    : '반려됨'}
                </span>
                {sub.status !== 'deleted' && (
                  <button
                    onClick={() => setDeletingSub(sub)}
                    className="px-3 py-1.5 rounded-xl bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer"
                  >
                    숨김/삭제
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {deletingSub && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleDeleteSubmission}
            className="bg-[#FBF9F5] rounded-[28px] max-w-md w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-extrabold text-[#141413]">
              실천 기록 숨김/삭제 및 점수 회수
            </h3>
            <p className="text-xs text-[#5C574F]">
              승인된 기록을 삭제하면 지급된 점수가 원장에서 자동 차감되며 감사 로그에 사유가 기록됩니다.
            </p>
            <input
              type="text"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="삭제 사유를 입력해 주세요 (필수)"
              required
              className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingSub(null)}
                className="px-4 py-2 rounded-xl bg-[#EFECE6] text-xs font-bold cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
              >
                삭제 및 원장 갱신
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 4. TEACHER MISSION MANAGEMENT & APPROVAL VIEW
 * ========================================================================== */
const TeacherMissionsView: React.FC<TeacherContextProps> = ({
  workspaceOwnerUid,
  teacherProfile,
  missions,
  onNotify,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [howTo, setHowTo] = useState('');
  const [points, setPoints] = useState(10);
  const [category, setCategory] = useState<MissionCategory>('kindness');
  const [requiresApproval, setRequiresApproval] = useState(false);

  const sortedMissions = useMemo(
    () => [...missions].sort((a, b) => a.orderIndex - b.orderIndex),
    [missions]
  );

  const handleAddMission = async (e: React.FormEvent) => {
    e.preventDefault();
    const prefix = workspaceOwnerUid.slice(0, 8);
    const missionId = `${prefix}_mission_custom_${Date.now()}`;
    const nextOrder = sortedMissions.length + 1;

    try {
      await setDoc(doc(db, 'missions', missionId), {
        missionId,
        workspaceOwnerUid,
        orderIndex: nextOrder,
        title: sanitizeText(title, 120),
        description: sanitizeText(description, 400),
        howTo: sanitizeText(howTo || description, 400),
        category,
        difficulty: points >= 15 ? 'hard' : 'medium',
        points: Number(points),
        active: true,
        requiresTeacherApproval: requiresApproval,
        allowRepeat: true,
        maxCompletions: 3,
        badgeRuleType: category === 'observation' ? 'observation' : 'care',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await recordAuditLog({
        workspaceOwnerUid,
        actorUid: teacherProfile.uid,
        actorName: teacherProfile.displayName,
        action: 'MISSION_ADDED',
        targetType: 'mission',
        targetId: missionId,
        reason: '신규 학급 맞춤형 마니또 미션 추가',
        metadataSummary: `${title} (+${points}점)`,
      });

      setTitle('');
      setDescription('');
      setHowTo('');
      onNotify('새로운 마니또 미션이 추가되었습니다!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `missions/${missionId}`);
    }
  };

  const handleToggleMissionActive = async (m: Mission) => {
    try {
      await updateDoc(doc(db, 'missions', m.missionId), {
        active: !m.active,
        updatedAt: serverTimestamp(),
      });
      onNotify(
        `[${m.title}] 미션이 ${!m.active ? '활성화' : '비활성화'}되었습니다.`,
        'info'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `missions/${m.missionId}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#6B665E] mb-1">
          미션 추가 · 점수 설정 · 활성화/비활성화 관리
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
          마니또 미션 관리 ({sortedMissions.length}개)
        </h1>
      </div>

      {/* Add Mission Form */}
      <form
        onSubmit={handleAddMission}
        className="bg-[#F3EFEA] rounded-[28px] p-6 space-y-4"
      >
        <h2 className="text-base font-extrabold text-[#141413]">+ 새 마니또 미션 추가하기</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="미션 제목 (예: 급식 시간에 감사 인사하기)"
            required
            className="rounded-xl bg-white px-3.5 py-2 text-xs"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MissionCategory)}
            className="rounded-xl bg-white px-3.5 py-2 text-xs font-bold"
          >
            <option value="kindness">친절·인사</option>
            <option value="observation">관찰·장점 발견</option>
            <option value="care">배려·도움</option>
            <option value="gratitude">감사·편지</option>
            <option value="cooperation">학급 협력</option>
          </select>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={50}
              step={5}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              className="w-24 rounded-xl bg-white px-3 py-2 text-xs font-bold tabular-nums"
            />
            <span className="text-xs font-bold">점</span>
            <label className="flex items-center gap-1.5 text-xs font-semibold ml-2">
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
              />
              <span>교사 확인 필요</span>
            </label>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="미션 상세 설명 및 실천 방법..."
            required
            className="flex-1 rounded-xl bg-white px-3.5 py-2 text-xs"
          />
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-[#141413] text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
          >
            미션 등록
          </button>
        </div>
      </form>

      {/* Missions List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {sortedMissions.map((m) => (
          <div
            key={m.missionId}
            className={`rounded-2xl p-4 flex items-center justify-between gap-3 ${
              m.active ? 'bg-[#F3EFEA]' : 'bg-[#EFECE6] opacity-60'
            }`}
          >
            <div>
              <p className="text-xs font-extrabold text-[#141413]">
                {String(m.orderIndex).padStart(2, '0')}. {m.title} (+{m.points}점)
              </p>
              <p className="text-[11px] text-[#5C574F] mt-0.5">
                {m.requiresTeacherApproval ? '선생님 확인 후 승인' : '실천 기록 시 자동 승인'} · 최대{' '}
                {m.maxCompletions}회
              </p>
            </div>
            <button
              onClick={() => handleToggleMissionActive(m)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer shrink-0 ${
                m.active ? 'bg-white text-[#141413]' : 'bg-[#141413] text-white'
              }`}
            >
              {m.active ? '활성 중' : '비활성'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============================================================================
 * 5. TEACHER MANITTO ASSIGNMENT MANAGEMENT VIEW
 * ========================================================================== */
const TeacherAssignmentsView: React.FC<TeacherContextProps> = ({
  workspaceOwnerUid,
  teacherProfile,
  allUsers,
  assignments,
  appSettings,
  onNotify,
}) => {
  const [shuffling, setShuffling] = useState(false);

  const activeStudents = useMemo(
    () => allUsers.filter((u) => u.role === 'student' && u.accountStatus === 'active'),
    [allUsers]
  );

  const handleShuffleAssignments = async () => {
    if (activeStudents.length < 2 || shuffling) return;
    setShuffling(true);
    try {
      // Create a circular derangement permutation
      const shuffled = [...activeStudents].sort(() => Math.random() - 0.5);
      for (let i = 0; i < assignments.length; i++) {
        const assign = assignments[i];
        const giver = shuffled[i % shuffled.length];
        const receiver = shuffled[(i + 1) % shuffled.length];
        if (giver && receiver) {
          await updateDoc(doc(db, 'manittoAssignments', assign.assignmentId), {
            giverUid: giver.uid,
            receiverUid: receiver.uid,
            updatedAt: serverTimestamp(),
          });
        }
      }

      await recordAuditLog({
        workspaceOwnerUid,
        actorUid: teacherProfile.uid,
        actorName: teacherProfile.displayName,
        action: 'MANITTO_RESHUFFLED',
        targetType: 'manittoAssignments',
        targetId: teacherProfile.classId,
        reason: '교사에 의한 학급 전체 마니또 순환 재배정',
        metadataSummary: `활성 학생 ${activeStudents.length}명 마니또 순환 배정 갱신`,
      });

      onNotify('학급 전체 마니또가 겹치지 않게 순환 재배정되었습니다!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'manittoAssignments');
    } finally {
      setShuffling(false);
    }
  };

  const handleToggleRevealPolicy = async () => {
    if (!appSettings) return;
    const nextPolicy =
      appSettings.identityRevealPolicy === 'hidden' ? 'revealed' : 'hidden';
    try {
      await updateDoc(doc(db, 'appSettings', appSettings.settingId), {
        identityRevealPolicy: nextPolicy,
        updatedBy: teacherProfile.uid,
        updatedAt: serverTimestamp(),
      });

      await recordAuditLog({
        workspaceOwnerUid,
        actorUid: teacherProfile.uid,
        actorName: teacherProfile.displayName,
        action: 'MANITTO_REVEAL_POLICY_CHANGED',
        targetType: 'appSettings',
        targetId: appSettings.settingId,
        reason: nextPolicy === 'revealed' ? '마니또 정체 공개 전환' : '마니또 정체 비공개 전환',
        metadataSummary: `identityRevealPolicy -> ${nextPolicy}`,
      });

      onNotify(
        nextPolicy === 'revealed'
          ? '마니또 정체가 학생들의 프로필 화면에 공개되었습니다! 🎉'
          : '마니또 정체가 다시 비밀 모드로 전환되었습니다. 🤫',
        'success'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'appSettings');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#6B665E] mb-1">
            마니또 순환 배정 관리 및 정체 공개 정책 설정
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
            우리 반 마니또 배정 현황
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleRevealPolicy}
            className="px-4 py-2.5 rounded-xl bg-[#DDD5F8] text-[#141413] text-xs font-bold cursor-pointer"
          >
            {appSettings?.identityRevealPolicy === 'revealed'
              ? '현재: 마니또 공개됨 (다시 숨기기)'
              : '현재: 마니또 비밀 유지 중 (정체 공개하기)'}
          </button>
          <button
            onClick={handleShuffleAssignments}
            disabled={shuffling}
            className="px-4 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-bold cursor-pointer flex items-center gap-1.5"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>무작위 순환 재배정</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {assignments.map((a, idx) => {
          const giver = allUsers.find((u) => u.uid === a.giverUid);
          const receiver = allUsers.find((u) => u.uid === a.receiverUid);
          return (
            <div
              key={a.assignmentId}
              className="bg-[#F3EFEA] rounded-[24px] p-5 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5">
                <AvatarIllustration avatarId={giver?.avatarId || 'rabbit'} size="sm" />
                <div>
                  <span className="text-[10px] font-bold text-[#6B665E]">마니또 (챙겨주는 학생)</span>
                  <p className="text-sm font-extrabold text-[#141413]">
                    {giver?.displayName || '학생'}
                  </p>
                </div>
              </div>

              <span className="text-base font-extrabold text-[#141413]">→</span>

              <div className="flex items-center gap-2.5 text-right">
                <div>
                  <span className="text-[10px] font-bold text-emerald-700">대상 친구</span>
                  <p className="text-sm font-extrabold text-[#141413]">
                    {receiver?.displayName || '학생'}
                  </p>
                </div>
                <AvatarIllustration avatarId={receiver?.avatarId || 'cat'} size="sm" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ============================================================================
 * 6. TEACHER SAFETY REPORTS MODERATION VIEW
 * ========================================================================== */
const TeacherReportsView: React.FC<TeacherContextProps> = ({
  workspaceOwnerUid,
  teacherProfile,
  allUsers,
  reports,
  onNotify,
}) => {
  const handleResolveReport = async (
    rep: ReportRecord,
    decision: 'resolved' | 'dismissed'
  ) => {
    try {
      await updateDoc(doc(db, 'reports', rep.reportId), {
        status: decision,
        reviewedBy: teacherProfile.uid,
        reviewedAt: new Date().toISOString(),
        reviewNote:
          decision === 'resolved'
            ? '해당 편지/메시지 숨김 조치 완료'
            : '검토 결과 정상 범위로 기각 처리',
        updatedAt: serverTimestamp(),
      });

      if (decision === 'resolved') {
        if (rep.targetType === 'letter') {
          await updateDoc(doc(db, 'letters', rep.targetId), {
            moderationStatus: 'hidden',
            updatedAt: serverTimestamp(),
          });
        } else if (rep.targetType === 'loungeMessage') {
          await updateDoc(doc(db, 'loungeMessages', rep.targetId), {
            moderationStatus: 'hidden',
            hiddenAt: new Date().toISOString(),
            hiddenBy: teacherProfile.uid,
            updatedAt: serverTimestamp(),
          });
        }
      }

      await recordAuditLog({
        workspaceOwnerUid,
        actorUid: teacherProfile.uid,
        actorName: teacherProfile.displayName,
        action: `REPORT_${decision.toUpperCase()}`,
        targetType: rep.targetType,
        targetId: rep.targetId,
        reason: rep.reason,
        metadataSummary: `신고 처리 완료 (${decision})`,
      });

      onNotify('신고 내역 검토 및 안전 조치가 완료되었습니다.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reports/${rep.reportId}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#6B665E] mb-1">
          부적절한 편지 및 익명 라운지 메시지 신고 검토
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
          학급 안전 신고 검토 관리 ({reports.length}건)
        </h1>
      </div>

      {reports.length === 0 ? (
        <div className="bg-[#F3EFEA] rounded-[28px] p-8 text-center text-xs text-[#6B665E]">
          접수된 신고 내역이 없습니다. 우리 반 친구들이 고운 말을 잘 사용하고 있어요!
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((rep) => {
            const reporter = allUsers.find((u) => u.uid === rep.reporterUid);
            return (
              <div
                key={rep.reportId}
                className="bg-[#F3EFEA] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-extrabold text-rose-700">
                      [{rep.targetType === 'letter' ? '익명 편지 신고' : '라운지 메시지 신고'}]
                    </span>
                    <span>신고자: {reporter?.displayName || '학생'}</span>
                    <span>·</span>
                    <span className="font-bold">
                      상태:{' '}
                      {rep.status === 'pending'
                        ? '검토 대기'
                        : rep.status === 'resolved'
                        ? '숨김 조치됨'
                        : '기각됨'}
                    </span>
                  </div>
                  <p className="text-xs text-[#141413]">
                    <strong>대상 내용:</strong> {rep.targetPreview}
                  </p>
                  <p className="text-xs text-[#5C574F]">
                    <strong>신고 사유:</strong> {rep.reason}
                  </p>
                </div>

                {rep.status === 'pending' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleResolveReport(rep, 'dismissed')}
                      className="px-3 py-1.5 rounded-xl bg-white text-xs font-bold text-[#141413] cursor-pointer"
                    >
                      기각
                    </button>
                    <button
                      onClick={() => handleResolveReport(rep, 'resolved')}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                    >
                      해당 콘텐츠 숨김 조치
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 7. TEACHER LOUNGE SCHEDULE & CHAT MODERATION VIEW
 * ========================================================================== */
const TeacherLoungeView: React.FC<TeacherContextProps> = ({
  workspaceOwnerUid,
  teacherProfile,
  allUsers,
  loungeSession,
  loungeParticipants,
  loungeMessages,
  onNotify,
}) => {
  const [title, setTitle] = useState(loungeSession?.title || '');
  const [scheduledDate, setScheduledDate] = useState(
    loungeSession?.scheduledDate || new Date().toISOString().slice(0, 10)
  );
  const [startsAt, setStartsAt] = useState(loungeSession?.startsAt || '08:30');
  const [endsAt, setEndsAt] = useState(loungeSession?.endsAt || '16:30');
  const [noticeRules, setNoticeRules] = useState(loungeSession?.noticeRules || '');

  if (!loungeSession) return null;

  const handleUpdateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, 'loungeSessions', loungeSession.sessionId), {
        title: sanitizeText(title, 120),
        scheduledDate,
        startsAt,
        endsAt,
        noticeRules: sanitizeText(noticeRules, 400),
        updatedAt: serverTimestamp(),
      });
      onNotify('라운지 운영 일정과 공지 규칙이 저장되었습니다.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'loungeSessions');
    }
  };

  const handleSetStatus = async (status: LoungeSession['status']) => {
    try {
      await updateDoc(doc(db, 'loungeSessions', loungeSession.sessionId), {
        status,
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        workspaceOwnerUid,
        actorUid: teacherProfile.uid,
        actorName: teacherProfile.displayName,
        action: `LOUNGE_STATUS_${status.toUpperCase()}`,
        targetType: 'loungeSession',
        targetId: loungeSession.sessionId,
        reason: '교사에 의한 익명 라운지 운영 상태 변경',
        metadataSummary: `status -> ${status}`,
      });
      onNotify(`라운지 상태가 [${status}](으)로 변경되었습니다.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'loungeSessions');
    }
  };

  const handleToggleHideMessage = async (msg: LoungeMessage) => {
    const nextStatus = msg.moderationStatus === 'hidden' ? 'normal' : 'hidden';
    try {
      await updateDoc(doc(db, 'loungeMessages', msg.messageId), {
        moderationStatus: nextStatus,
        hiddenAt: nextStatus === 'hidden' ? new Date().toISOString() : '',
        hiddenBy: nextStatus === 'hidden' ? teacherProfile.uid : '',
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        workspaceOwnerUid,
        actorUid: teacherProfile.uid,
        actorName: teacherProfile.displayName,
        action: nextStatus === 'hidden' ? 'LOUNGE_MSG_HIDDEN' : 'LOUNGE_MSG_RESTORED',
        targetType: 'loungeMessage',
        targetId: msg.messageId,
        reason: '교사의 라운지 대화 안전 관리 조치',
        metadataSummary: `[${msg.anonymousAlias}] ${msg.body.slice(0, 40)}`,
      });
      onNotify(
        nextStatus === 'hidden' ? '메시지가 숨김 처리되었습니다.' : '메시지가 복구되었습니다.',
        'info'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'loungeMessages');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#6B665E] mb-1">
          라운지 운영 시간 설정 · 대기실/대화방 제어 · 작성자 실명 안전 확인
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
          익명 학급 라운지 운영 및 대화 기록 관리
        </h1>
      </div>

      {/* Status Control Buttons */}
      <div className="bg-[#DDD5F8] rounded-[28px] p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-[#3730A3]">현재 라운지 상태 제어</span>
          <h2 className="text-lg font-extrabold text-[#141413] mt-0.5">
            현재 상태: {loungeSession.status.toUpperCase()}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'scheduled', label: '1. 운영 예정' },
              { id: 'waiting', label: '2. 대기실 열기' },
              { id: 'active', label: '3. 라운지 시작 (대화 허용)' },
              { id: 'ended', label: '4. 라운지 종료 (전송 차단)' },
            ] as const
          ).map((btn) => (
            <button
              key={btn.id}
              onClick={() => handleSetStatus(btn.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                loungeSession.status === btn.id
                  ? 'bg-[#141413] text-white'
                  : 'bg-white text-[#141413]'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Schedule Editor */}
      <form
        onSubmit={handleUpdateSchedule}
        className="bg-[#F3EFEA] rounded-[28px] p-6 space-y-4"
      >
        <h3 className="text-base font-extrabold text-[#141413]">라운지 일정 및 규칙 설정</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="라운지 제목"
            className="rounded-xl bg-white px-3.5 py-2 text-xs md:col-span-2"
          />
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="rounded-xl bg-white px-3.5 py-2 text-xs"
          />
          <div className="flex items-center gap-1.5">
            <input
              type="time"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="rounded-xl bg-white px-2.5 py-2 text-xs w-full"
            />
            <span>~</span>
            <input
              type="time"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="rounded-xl bg-white px-2.5 py-2 text-xs w-full"
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={noticeRules}
            onChange={(e) => setNoticeRules(e.target.value)}
            placeholder="대화 규칙 공지 문구"
            className="flex-1 rounded-xl bg-white px-3.5 py-2 text-xs"
          />
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-[#141413] text-white text-xs font-bold cursor-pointer"
          >
            일정 및 공지 저장
          </button>
        </div>
      </form>

      {/* Teacher Message Moderation Log (Shows Real Student Name ONLY to Teacher) */}
      <div className="bg-[#F3EFEA] rounded-[28px] p-6 space-y-3">
        <h3 className="text-base font-extrabold text-[#141413]">
          라운지 전체 대화 기록 및 안전 관리 (교사 전용 실명 매핑)
        </h3>
        <div className="space-y-2">
          {loungeMessages.map((msg) => {
            const realStu = allUsers.find((u) => u.uid === msg.senderUid);
            return (
              <div
                key={msg.messageId}
                className={`rounded-2xl p-4 flex items-center justify-between gap-3 ${
                  msg.moderationStatus === 'hidden' ? 'bg-rose-50 opacity-60' : 'bg-white'
                }`}
              >
                <div>
                  <p className="text-xs font-bold text-[#141413]">
                    익명 별명: [{msg.anonymousAlias}]{' '}
                    <span className="text-[#6B665E] font-normal">
                      (실제 작성 학생: {realStu?.displayName || msg.senderUid})
                    </span>
                  </p>
                  <p className="text-xs text-[#3D3A35] mt-1">{msg.body}</p>
                </div>

                <button
                  onClick={() => handleToggleHideMessage(msg)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer shrink-0 ${
                    msg.moderationStatus === 'hidden'
                      ? 'bg-[#141413] text-white'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {msg.moderationStatus === 'hidden' ? '숨김 해제' : '메시지 숨김'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 8. TEACHER CLASSROOM ANALYTICS & STATS VIEW
 * ========================================================================== */
const TeacherStatsView: React.FC<TeacherContextProps> = ({
  allUsers,
  missions,
  submissions,
  stats,
  badges,
  badgeAwards,
}) => {
  const students = allUsers.filter((u) => u.role === 'student');

  const studentChartData = useMemo(() => {
    return students.map((stu) => {
      const st = stats.find((x) => x.studentUid === stu.uid);
      return {
        name: stu.displayName,
        점수: st?.totalPoints ?? 0,
        완료미션수: st?.completedMissionCount ?? 0,
      };
    });
  }, [students, stats]);

  const badgeDistribution = useMemo(() => {
    return badges.map((b) => ({
      name: b.name,
      획득학생수: badgeAwards.filter((a) => a.badgeId === b.badgeId).length,
    }));
  }, [badges, badgeAwards]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#6B665E] mb-1">
          학급 전체 활동 추이 · 미션 참여율 · 뱃지 획득 현황 (비경쟁 성장 통계)
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
          5학년 2반 학급 친절 성장 통계
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#F3EFEA] rounded-[28px] p-6">
          <h2 className="text-base font-bold text-[#141413] mb-3">
            학생별 누적 친절 점수 및 완료 미션 현황
          </h2>
          <div className="h-64 bg-white rounded-2xl p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={studentChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFECE6" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="점수" fill="#10B981" radius={[8, 8, 0, 0]} />
                <Bar dataKey="완료미션수" fill="#818CF8" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#F3EFEA] rounded-[28px] p-6">
          <h2 className="text-base font-bold text-[#141413] mb-3">
            마니또 뱃지 5종 학급 획득 현황
          </h2>
          <div className="h-64 bg-white rounded-2xl p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={badgeDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFECE6" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="획득학생수" fill="#F59E0B" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 9. TEACHER SETTINGS & IMMUTABLE AUDIT LOGS VIEW
 * ========================================================================== */
const TeacherSettingsAndAuditView: React.FC<TeacherContextProps> = ({
  workspaceOwnerUid,
  teacherProfile,
  auditLogs,
  appSettings,
  onNotify,
}) => {
  const [loungeRules, setLoungeRules] = useState(appSettings?.loungeRules || '');
  const [profilePolicy, setProfilePolicy] = useState(appSettings?.profilePolicy || '');
  const [allowPhoto, setAllowPhoto] = useState(appSettings?.allowPhotoEvidence ?? false);

  // Teacher Admin Credentials Change State
  const [adminLoginId, setAdminLoginId] = useState(teacherProfile.studentLoginId);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const handleSaveTeacherCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changingPw) return;

    const cleanLoginId = adminLoginId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (cleanLoginId.length < 3) {
      onNotify('관리자 아이디는 영문/숫자 3자 이상이어야 합니다.', 'error');
      return;
    }
    if (newPassword.trim().length < 4) {
      onNotify('새 관리자 비밀번호는 4자리 이상으로 입력해 주세요.', 'error');
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      onNotify('새 비밀번호와 비밀번호 확인이 일치하지 않습니다.', 'error');
      return;
    }

    setChangingPw(true);
    try {
      const currentHash = await hashPassword(currentPassword.trim());
      if (currentHash !== teacherProfile.passwordHash) {
        onNotify('현재 관리자 비밀번호가 일치하지 않습니다.', 'error');
        setChangingPw(false);
        return;
      }

      const nextHash = await hashPassword(newPassword.trim());
      await updateDoc(doc(db, 'users', teacherProfile.uid), {
        studentLoginId: cleanLoginId,
        passwordHash: nextHash,
        updatedAt: serverTimestamp(),
      });

      await recordAuditLog({
        workspaceOwnerUid,
        actorUid: teacherProfile.uid,
        actorName: teacherProfile.displayName,
        action: 'TEACHER_CREDENTIALS_UPDATED',
        targetType: 'user',
        targetId: teacherProfile.uid,
        reason: '교사 관리자 아이디 및 비밀번호 보안 변경',
        metadataSummary: `관리자 ID: ${cleanLoginId} (비밀번호 암호화 변경 완료)`,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onNotify('교사 관리자 아이디와 비밀번호가 안전하게 변경되었습니다!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${teacherProfile.uid}`);
    } finally {
      setChangingPw(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appSettings) return;
    try {
      await updateDoc(doc(db, 'appSettings', appSettings.settingId), {
        loungeRules: sanitizeText(loungeRules, 500),
        profilePolicy: sanitizeText(profilePolicy, 500),
        allowPhotoEvidence: allowPhoto,
        updatedBy: teacherProfile.uid,
        updatedAt: serverTimestamp(),
      });

      await recordAuditLog({
        workspaceOwnerUid,
        actorUid: teacherProfile.uid,
        actorName: teacherProfile.displayName,
        action: 'APP_SETTINGS_UPDATED',
        targetType: 'appSettings',
        targetId: appSettings.settingId,
        reason: '학교 개인정보 보호 및 운영 정책 업데이트',
        metadataSummary: `사진 증빙 허용: ${allowPhoto}`,
      });

      onNotify('학급 운영 및 개인정보 보호 정책 설정이 저장되었습니다.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'appSettings');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#6B665E] mb-1">
          교사 관리자 비밀번호 변경 · 학급 안전 정책 설정 · 감사 로그(Audit Logs)
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
          교사 보안 설정 및 감사 로그
        </h1>
      </div>

      {/* Teacher Admin ID & Password Security Form */}
      <form
        onSubmit={handleSaveTeacherCredentials}
        className="bg-[#E0F2FE] rounded-[28px] p-6 space-y-4"
      >
        <div>
          <h2 className="text-base font-extrabold text-[#141413]">
            🔒 교사 관리자 아이디 및 비밀번호 변경
          </h2>
          <p className="text-xs text-[#3D3A35] mt-0.5">
            학생이나 외부인이 교사 대시보드에 들어오지 못하도록 관리자 비밀번호를 안전하게 변경하세요.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1">
              관리자 로그인 아이디
            </label>
            <input
              type="text"
              value={adminLoginId}
              onChange={(e) => setAdminLoginId(e.target.value)}
              required
              className="w-full rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-[#141413]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1">
              현재 관리자 비밀번호
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="현재 비밀번호 입력"
              required
              className="w-full rounded-xl bg-white px-3.5 py-2 text-xs text-[#141413]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1">
              새 관리자 비밀번호 (4자 이상)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="새 비밀번호 입력"
              required
              className="w-full rounded-xl bg-white px-3.5 py-2 text-xs text-[#141413]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1">
              새 관리자 비밀번호 확인
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="새 비밀번호 다시 입력"
              required
              className="w-full rounded-xl bg-white px-3.5 py-2 text-xs text-[#141413]"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={changingPw}
            className="px-5 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-bold cursor-pointer"
          >
            {changingPw ? '변경 중...' : '교사 관리자 비밀번호 변경 저장'}
          </button>
        </div>
      </form>

      <form
        onSubmit={handleSaveSettings}
        className="bg-[#F3EFEA] rounded-[28px] p-6 space-y-4"
      >
        <h2 className="text-base font-extrabold text-[#141413]">학급 안전 및 개인정보 보호 설정</h2>
        <div>
          <label className="block text-xs font-bold text-[#141413] mb-1">
            익명 라운지 대화 규칙 안내문
          </label>
          <textarea
            rows={3}
            value={loungeRules}
            onChange={(e) => setLoungeRules(e.target.value)}
            className="w-full rounded-xl bg-white p-3 text-xs"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#141413] mb-1">
            학생 프로필 개인정보 보호 정책 안내문
          </label>
          <textarea
            rows={2}
            value={profilePolicy}
            onChange={(e) => setProfilePolicy(e.target.value)}
            className="w-full rounded-xl bg-white p-3 text-xs"
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs font-bold text-[#141413]">
            <input
              type="checkbox"
              checked={allowPhoto}
              onChange={(e) => setAllowPhoto(e.target.checked)}
            />
            <span>미션 실천 기록 시 사진/증빙 자료 첨부 허용 (학부모 동의 완료 시에만 체크)</span>
          </label>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-bold cursor-pointer"
          >
            정책 저장
          </button>
        </div>
      </form>

      {/* Immutable Audit Logs Table */}
      <div className="bg-[#F3EFEA] rounded-[28px] p-6">
        <h2 className="text-base font-extrabold text-[#141413] mb-3">
          감사 로그 (Audit Logs · 수정 및 삭제 불가)
        </h2>
        <div className="bg-white rounded-2xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-[#EFECE6] text-xs text-[#6B665E]">
                <th className="py-3 px-4">작업자</th>
                <th className="py-3 px-4">작업 유형</th>
                <th className="py-3 px-4">사유</th>
                <th className="py-3 px-4">상세 내역</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFECE6] text-xs">
              {auditLogs.map((log) => (
                <tr key={log.logId}>
                  <td className="py-3 px-4 font-bold text-[#141413]">{log.actorName}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-indigo-700">
                    {log.action}
                  </td>
                  <td className="py-3 px-4 text-[#3D3A35]">{log.reason}</td>
                  <td className="py-3 px-4 text-[#6B665E]">{log.metadataSummary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
