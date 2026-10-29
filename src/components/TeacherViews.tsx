import React, { useState, useEffect, useMemo } from 'react';
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
  KeyRound,
  UploadCloud,
  CheckSquare,
  Square,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Zap,
  Filter,
  Check,
  X,
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
import { doc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  UserProfile,
  ClassRoom,
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
  resetStudentPasswordTo1234,
  createStudentsBatch,
  deleteStudentsBatch,
  cleanupOrphanedActivityData,
  resetAllClassroomActivities,
  updateTeacherProfile,
  updateClassroomInfo,
  generateFullClassroomAssignments,
  normalizeClassId,
  deleteAuditLog,
  deleteAllAuditLogs,
} from '../services/manittoServerEngine';

interface TeacherContextProps {
  workspaceOwnerUid: string;
  teacherProfile: UserProfile;
  currentClass: ClassRoom | null;
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
 * TEACHER PROFILE MODAL (Allows updating Teacher Display Name, Avatar, Bio, Class)
 * ========================================================================== */
interface TeacherProfileModalProps {
  workspaceOwnerUid: string;
  teacherProfile: UserProfile;
  currentClass: ClassRoom | null;
  isOpen: boolean;
  onClose: () => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const TeacherProfileModal: React.FC<TeacherProfileModalProps> = ({
  workspaceOwnerUid,
  teacherProfile,
  currentClass,
  isOpen,
  onClose,
  onNotify,
}) => {
  const [displayName, setDisplayName] = useState(teacherProfile.displayName);
  const [avatarId, setAvatarId] = useState(teacherProfile.avatarId || 'teacher');
  const [bio, setBio] = useState(teacherProfile.bio || '');
  const [schoolName, setSchoolName] = useState(currentClass?.schoolName || '전주신동초등학교');
  const [className, setClassName] = useState(currentClass?.name || '5학년 2반');
  const [saving, setSaving] = useState(false);

  // Sync state whenever modal is opened
  React.useEffect(() => {
    if (isOpen) {
      setDisplayName(teacherProfile.displayName);
      setAvatarId(teacherProfile.avatarId || 'teacher');
      setBio(teacherProfile.bio || '');
      setSchoolName(currentClass?.schoolName || '전주신동초등학교');
      setClassName(currentClass?.name || '5학년 2반');
    }
  }, [isOpen, teacherProfile, currentClass]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      onNotify('교사 성함을 입력해 주세요.', 'error');
      return;
    }
    if (!className.trim()) {
      onNotify('학급 이름을 입력해 주세요.', 'error');
      return;
    }
    setSaving(true);
    try {
      await updateTeacherProfile({
        workspaceOwnerUid,
        teacherUid: teacherProfile.uid,
        displayName: displayName.trim(),
        avatarId,
        bio: bio.trim(),
        classId: teacherProfile.classId || currentClass?.classId || `class_${workspaceOwnerUid.slice(0, 8)}_5_2`,
        className: className.trim(),
        schoolName: schoolName.trim() || '전주신동초등학교',
      });
      onNotify('교사 성함과 학급 이름이 성공적으로 변경되었습니다!', 'success');
      onClose();
    } catch (err) {
      onNotify(
        '프로필 및 학급 이름 변경 중 오류 발생: ' + (err instanceof Error ? err.message : String(err)),
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FBF9F5] rounded-[32px] max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl border border-white">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2DDD3]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#DDD5F8] flex items-center justify-center text-xl">
              👨‍🏫
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[#141413]">교사 프로필 및 학급 이름 수정</h3>
              <p className="text-xs text-[#6B665E]">
                선생님 성함, 학급 명칭, 학교명, 아바타, 소개글을 변경합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#EFECE6] flex items-center justify-center text-sm font-bold cursor-pointer hover:bg-[#E2DDD3]"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-extrabold text-[#141413] mb-1.5">
              선생님 성함 / 표시 이름
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="예: 김신동 선생님"
              required
              className="w-full rounded-xl bg-white px-3.5 py-2.5 text-xs text-[#141413] font-bold focus:outline-none focus:ring-2 focus:ring-[#141413]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-extrabold text-[#141413] mb-1.5">
                학교명
              </label>
              <input
                type="text"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="예: 전주신동초등학교"
                required
                className="w-full rounded-xl bg-white px-3.5 py-2.5 text-xs text-[#141413] font-bold focus:outline-none focus:ring-2 focus:ring-[#141413]"
              />
            </div>
            <div>
              <label className="block text-xs font-extrabold text-[#141413] mb-1.5">
                학급 이름 / 명칭
              </label>
              <input
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="예: 5학년 2반"
                required
                className="w-full rounded-xl bg-white px-3.5 py-2.5 text-xs text-[#141413] font-bold focus:outline-none focus:ring-2 focus:ring-[#141413]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-extrabold text-[#141413] mb-1.5">
              교사 캐릭터 아바타
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-36 overflow-y-auto p-1.5 bg-white rounded-2xl border border-[#E8E4DC]">
              {AVATAR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAvatarId(opt.id)}
                  className={`p-2 rounded-xl flex flex-col items-center gap-1 cursor-pointer transition-all ${
                    avatarId === opt.id
                      ? 'bg-[#141413] text-white ring-2 ring-[#141413]'
                      : 'hover:bg-[#F3EFEA] text-[#141413]'
                  }`}
                >
                  <AvatarIllustration avatarId={opt.id} size="sm" />
                  <span className="text-[10px] font-bold truncate max-w-full">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-extrabold text-[#141413] mb-1.5">
              학급 마니또 인사말 / 소개 문구
            </label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="예: 서로를 배려하고 칭찬하는 따뜻한 5학년 2반 마니또 교실입니다 🌸"
              className="w-full rounded-xl bg-white p-3 text-xs text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#141413]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-[#EFECE6] text-xs font-bold text-[#4A463F] cursor-pointer hover:bg-[#E2DDD3]"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-extrabold cursor-pointer hover:bg-[#2C2A27] shadow-xs"
            >
              {saving ? '저장 중...' : '프로필 및 학급 정보 저장하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ============================================================================
 * 1. TEACHER OVERVIEW DASHBOARD (8 KPI Cards + Pending Approvals + Presence)
 * ========================================================================== */
const TeacherDashboardOverview: React.FC<TeacherContextProps> = ({
  workspaceOwnerUid,
  teacherProfile,
  currentClass,
  allUsers,
  missions,
  submissions,
  ledger,
  stats,
  badges,
  badgeAwards,
  letters,
  loungeSession,
  loungeParticipants,
  reports,
  onNavigate,
  onNotify,
}) => {
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [liveClock, setLiveClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setLiveClock(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const students = useMemo(
    () => allUsers.filter((u) => u.role === 'student'),
    [allUsers]
  );
  const onlineStudents = useMemo(
    () => students.filter((s) => s.accountStatus === 'active' && isUserCurrentlyOnline(s)),
    [students, liveClock]
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

  const liveLoungeParticipants = useMemo(() => {
    return loungeParticipants.filter((p) => {
      if (p.presenceStatus === 'left') return false;
      if (!p.lastHeartbeatAt) return false;
      const diffMs = liveClock - new Date(p.lastHeartbeatAt).getTime();
      return diffMs <= 2 * 60 * 1000;
    });
  }, [loungeParticipants, liveClock]);

  const isLoungeActive = loungeSession?.status === 'active';
  const waitingCount = liveLoungeParticipants.filter(
    (p) => p.presenceStatus === 'waiting' || !isLoungeActive
  ).length;
  const activeCount = isLoungeActive
    ? liveLoungeParticipants.filter((p) => p.presenceStatus === 'active').length
    : 0;

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
      {/* Header and Teacher Profile Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#6B665E] mb-1">
            {currentClass?.schoolName || '전주신동초등학교'} {currentClass?.name || '5학년 2반'} 교사용 관리자 대시보드
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
            우리 반 마니또 운영 및 안전 현황
          </h1>
        </div>

        {/* Teacher Profile Summary Chip & Edit Button */}
        <div className="bg-[#F3EFEA] rounded-2xl p-3 sm:px-4 sm:py-2.5 flex items-center justify-between gap-3 border border-[#E6E1D6]">
          <div className="flex items-center gap-2.5">
            <AvatarIllustration avatarId={teacherProfile.avatarId || 'teacher'} size="sm" />
            <div>
              <p className="text-xs font-extrabold text-[#141413]">
                {teacherProfile.displayName}
              </p>
              <p className="text-[11px] text-[#6B665E]">
                {currentClass?.name || '5학년 2반'} 담임선생님
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setProfileModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-white text-[#141413] text-xs font-bold hover:bg-[#141413] hover:text-white cursor-pointer shadow-xs transition-colors"
          >
            ✏️ 이름/프로필 수정
          </button>
        </div>
      </div>

      <TeacherProfileModal
        workspaceOwnerUid={workspaceOwnerUid}
        teacherProfile={teacherProfile}
        currentClass={currentClass}
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onNotify={onNotify}
      />

      {/* Real-time Pending Mission Push Notification Banner */}
      {pendingSubmissions.length > 0 && (
        <div
          onClick={() => onNavigate('missions')}
          className="bg-[#FEF3C7] border-2 border-amber-400 rounded-[24px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md cursor-pointer hover:bg-[#FDE68A] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-extrabold text-xl shadow-xs shrink-0 animate-bounce">
              🔔
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-extrabold text-amber-950">
                  [실시간 승인 알림] 학생이 제출한 미션 승인 대기건이 총 {pendingSubmissions.length}건 수신되었습니다!
                </p>
                <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[10px] font-extrabold animate-pulse">
                  NEW
                </span>
              </div>
              <p className="text-[11px] text-amber-800 mt-0.5">
                클릭하여 미션 관리·승인 탭으로 이동해서 바로 검토 및 승인/점수 지급을 처리하세요.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-amber-900 text-white text-xs font-extrabold whitespace-nowrap shadow-xs hover:bg-amber-950 shrink-0"
          >
            미션 관리 및 즉시 승인 →
          </button>
        </div>
      )}

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

  // Single Student Registration State
  const [newName, setNewName] = useState('');
  const [newLoginId, setNewLoginId] = useState('');
  const [newPassword, setNewPassword] = useState('1234');
  const [creating, setCreating] = useState(false);

  // Score adjustment modal state
  const [adjustingStudent, setAdjustingStudent] = useState<UserProfile | null>(null);
  const [pointsDelta, setPointsDelta] = useState<number>(5);
  const [adjustReason, setAdjustReason] = useState('');

  // Password Reset to 1234 Modal State
  const [resetTargetStudent, setResetTargetStudent] = useState<UserProfile | null>(null);
  const [resettingPw, setResettingPw] = useState(false);

  // Batch Registration State & Modal
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchPrefix, setBatchPrefix] = useState('shindong');
  const [batchCreating, setBatchCreating] = useState(false);

  // Batch Deletion State
  const [selectedStudentUids, setSelectedStudentUids] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState(false);

  // Orphaned Activity Cleanup & Full Activity Reset States
  const [cleaningOrphaned, setCleaningOrphaned] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resettingActivities, setResettingActivities] = useState(false);

  const handleCleanupOrphaned = async () => {
    if (cleaningOrphaned) return;
    setCleaningOrphaned(true);
    try {
      const res = await cleanupOrphanedActivityData({
        workspaceOwnerUid,
        teacherUid: teacherProfile.uid,
        teacherName: teacherProfile.displayName,
      });
      onNotify(
        res.cleanedCount > 0
          ? `삭제된 학생의 고아 활동 기록 총 ${res.cleanedCount}건을 깨끗하게 정리했습니다.`
          : '정리할 고아 활동 기록이 없습니다. 모든 활동 기록이 현재 학생 명단과 정상 일치합니다.',
        'success'
      );
    } catch (err) {
      onNotify('고아 활동 기록 정리 실패: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setCleaningOrphaned(false);
    }
  };

  const handleConfirmResetActivities = async () => {
    if (resettingActivities) return;
    setResettingActivities(true);
    try {
      await resetAllClassroomActivities({
        workspaceOwnerUid,
        teacherUid: teacherProfile.uid,
        teacherName: teacherProfile.displayName,
      });
      setResetModalOpen(false);
      onNotify('학급 전체 마니또 활동 기록이 0으로 깨끗하게 초기화되었습니다.', 'success');
    } catch (err) {
      onNotify('활동 기록 초기화 실패: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setResettingActivities(false);
    }
  };

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

  // Parse batch lines into student items
  const parsedBatchStudents = useMemo(() => {
    if (!batchText.trim()) return [];
    const lines = batchText
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter(Boolean);

    const existingLoginIds = new Set(allUsers.map((u) => u.studentLoginId.toLowerCase()));
    let nextIndex = 1;

    // Find highest existing numeric suffix if prefix matches
    allUsers.forEach((u) => {
      const match = u.studentLoginId.match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num >= nextIndex) nextIndex = num + 1;
      }
    });

    return lines.map((line, idx) => {
      // Clean leading number like "1. 홍길동" or "1번 홍길동"
      const cleanName = line.replace(/^\d+[\.\s번\-_]*/, '').trim();
      const seq = nextIndex + idx;
      let generatedId = `${batchPrefix}${seq < 10 ? '0' + seq : seq}`;
      while (existingLoginIds.has(generatedId.toLowerCase())) {
        nextIndex++;
        generatedId = `${batchPrefix}${nextIndex < 10 ? '0' + nextIndex : nextIndex}`;
      }
      existingLoginIds.add(generatedId.toLowerCase());
      const avatar = AVATAR_OPTIONS[(idx + 1) % 6].id;
      return {
        displayName: cleanName || `학생${idx + 1}`,
        studentLoginId: generatedId,
        avatarId: avatar,
      };
    });
  }, [batchText, batchPrefix, allUsers]);

  // Handle single student registration
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

  // Handle batch student registration
  const handleBatchCreateSubmit = async () => {
    if (parsedBatchStudents.length === 0 || batchCreating) return;
    setBatchCreating(true);
    try {
      const res = await createStudentsBatch({
        workspaceOwnerUid,
        teacherUid: teacherProfile.uid,
        teacherName: teacherProfile.displayName,
        classId: teacherProfile.classId,
        students: parsedBatchStudents,
      });
      onNotify(`학생 ${res.count}명의 계정이 일괄 등록되었습니다! (초기 비밀번호: 1234)`, 'success');
      setBatchModalOpen(false);
      setBatchText('');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '일괄 등록 오류', 'error');
    } finally {
      setBatchCreating(false);
    }
  };

  // Handle instant password reset to 1234
  const handleConfirmResetPassword = async () => {
    if (!resetTargetStudent || resettingPw) return;
    setResettingPw(true);
    try {
      await resetStudentPasswordTo1234({
        workspaceOwnerUid,
        teacherUid: teacherProfile.uid,
        teacherName: teacherProfile.displayName,
        student: resetTargetStudent,
      });
      onNotify(
        `${resetTargetStudent.displayName} 학생의 비밀번호가 '1234'로 즉시 초기화되었습니다!`,
        'success'
      );
      setResetTargetStudent(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '비밀번호 초기화 실패', 'error');
    } finally {
      setResettingPw(false);
    }
  };

  // Toggle account active/inactive
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

  // Toggle select all students in current view
  const handleToggleSelectAll = () => {
    if (selectedStudentUids.size === students.length && students.length > 0) {
      setSelectedStudentUids(new Set());
    } else {
      setSelectedStudentUids(new Set(students.map((s) => s.uid)));
    }
  };

  const handleToggleSelectStudent = (uid: string) => {
    setSelectedStudentUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  // Execute Batch Deletion
  const handleExecuteBatchDelete = async () => {
    if (deletingBatch) return;
    setDeletingBatch(true);
    try {
      const targets = isDeletingAll
        ? allUsers.filter((u) => u.role === 'student')
        : allUsers.filter((u) => selectedStudentUids.has(u.uid) && u.role === 'student');

      const res = await deleteStudentsBatch({
        workspaceOwnerUid,
        teacherUid: teacherProfile.uid,
        teacherName: teacherProfile.displayName,
        students: targets,
      });

      onNotify(`학생 ${res.count}명의 계정이 안전하게 삭제되었습니다.`, 'success');
      setSelectedStudentUids(new Set());
      setDeleteConfirmOpen(false);
      setIsDeletingAll(false);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '학생 삭제 오류', 'error');
    } finally {
      setDeletingBatch(false);
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

  const isAllSelected = students.length > 0 && selectedStudentUids.size === students.length;

  return (
    <div className="space-y-6 w-full">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#6B665E] mb-1">
            학생 계정 관리 · 1234 비밀번호 초기화 · 일괄 등록 및 일괄 삭제
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413] tracking-tight">
            우리 반 학생 명단 및 계정 관리
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setBatchModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#DDD5F8] text-[#3730A3] text-xs font-extrabold hover:bg-[#C9BFF3] cursor-pointer whitespace-nowrap shadow-xs"
          >
            <UploadCloud className="w-4 h-4" />
            <span>📋 학생 일괄 등록</span>
          </button>

          <button
            type="button"
            disabled={cleaningOrphaned}
            onClick={handleCleanupOrphaned}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-[#E0F2FE] text-[#0369A1] text-xs font-extrabold hover:bg-[#BAE6FD] cursor-pointer whitespace-nowrap shadow-xs"
            title="학생 계정이 삭제되어 남아있는 고아 활동 기록(미션, 점수, 뱃지, 편지 등)을 깨끗하게 정리합니다."
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cleaningOrphaned ? 'animate-spin' : ''}`} />
            <span>{cleaningOrphaned ? '정리 중...' : '🧹 잔여 기록 정리'}</span>
          </button>

          <button
            type="button"
            onClick={() => setResetModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-[#FEF3C7] text-[#92400E] text-xs font-extrabold hover:bg-[#FDE68A] cursor-pointer whitespace-nowrap shadow-xs"
            title="학생 계정은 유지하고 모든 미션 실천 기록, 점수, 뱃지, 편지, 대화 내용을 0으로 초기화합니다."
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>⚠️ 활동 전체 초기화</span>
          </button>

          {students.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setIsDeletingAll(true);
                setDeleteConfirmOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>전체 학생 일괄 삭제</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Add Single Student Form */}
      <div className="bg-[#E0F2FE] rounded-[28px] p-5 sm:p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus className="w-4 h-4 text-[#0369A1]" />
          <h3 className="text-xs sm:text-sm font-extrabold text-[#0369A1]">
            새로운 학생 1명 개별 등록
          </h3>
        </div>
        <form
          onSubmit={handleCreateStudent}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1">학생 이름</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예: 김신동"
              required
              className="w-full rounded-xl bg-white px-3.5 py-2.5 text-xs text-[#141413] font-bold focus:outline-none focus:ring-2 focus:ring-[#141413]"
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
              className="w-full rounded-xl bg-white px-3.5 py-2.5 text-xs text-[#141413] font-bold focus:outline-none focus:ring-2 focus:ring-[#141413]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1">
              초기 비밀번호 (기본: 1234)
            </label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full rounded-xl bg-white px-3.5 py-2.5 text-xs text-[#141413] font-bold focus:outline-none focus:ring-2 focus:ring-[#141413]"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="w-full py-2.5 px-4 rounded-xl bg-[#141413] text-white text-xs font-extrabold hover:bg-[#2C2A27] cursor-pointer shadow-xs whitespace-nowrap"
          >
            {creating ? '등록 중...' : '+ 학생 계정 발급하기'}
          </button>
        </form>
      </div>

      {/* Search & Sort Controls & Batch Action Bar */}
      <div className="bg-[#F3EFEA] rounded-[24px] p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1 sm:flex-none">
            <Search className="w-3.5 h-3.5 text-[#8C827A] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이름 또는 아이디 검색..."
              className="w-full rounded-xl bg-white pl-8 pr-3 py-2 text-xs text-[#141413] font-bold focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#141413] focus:outline-none"
          >
            <option value="all">전체 상태</option>
            <option value="active">활성 계정만</option>
            <option value="inactive">비활성 계정만</option>
          </select>
          <div className="flex items-center gap-1.5 text-xs text-[#6B665E]">
            <span className="text-[11px]">정렬:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-xl bg-white px-2.5 py-2 text-xs font-bold text-[#141413] focus:outline-none"
            >
              <option value="name">이름순</option>
              <option value="points">누적 점수순</option>
              <option value="missions">완료 미션순</option>
            </select>
          </div>
        </div>

        {/* Selected Students Batch Actions Bar */}
        {selectedStudentUids.size > 0 && (
          <div className="flex items-center justify-between sm:justify-end gap-2 bg-[#F6D4D2] px-3.5 py-1.5 rounded-2xl animate-fade-in">
            <span className="text-xs font-extrabold text-[#7F1D1D]">
              {selectedStudentUids.size}명 선택됨
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setIsDeletingAll(false);
                  setDeleteConfirmOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-extrabold hover:bg-rose-700 cursor-pointer shadow-xs whitespace-nowrap"
              >
                선택 학생 일괄 삭제
              </button>
              <button
                type="button"
                onClick={() => setSelectedStudentUids(new Set())}
                className="px-2 py-1.5 rounded-xl bg-white/70 text-xs font-bold text-[#141413] hover:bg-white cursor-pointer"
              >
                선택 해제
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Student List Table & Mobile Cards */}
      <div className="bg-[#F3EFEA] rounded-[28px] p-4 sm:p-6 overflow-hidden shadow-xs">
        {students.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#E6E1D6] flex items-center justify-center mx-auto text-xl">
              👥
            </div>
            <p className="text-sm font-bold text-[#141413]">등록된 학생 계정이 없습니다.</p>
            <p className="text-xs text-[#6B665E]">
              상단의 개별 등록 폼 또는 [학생 일괄 등록] 버튼으로 명단을 추가해 보세요.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-[#E2DDD3] text-xs font-extrabold text-[#6B665E]">
                  <th className="py-3 px-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="cursor-pointer text-[#141413] hover:opacity-80"
                      title={isAllSelected ? '전체 해제' : '전체 선택'}
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-[#141413]" />
                      ) : (
                        <Square className="w-4 h-4 text-[#8C827A]" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3">학생 (아이디)</th>
                  <th className="py-3 px-3">접속 상태</th>
                  <th className="py-3 px-3">누적 점수</th>
                  <th className="py-3 px-3">미션 / 뱃지</th>
                  <th className="py-3 px-3">프로필 공개</th>
                  <th className="py-3 px-3 text-right">관리 작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DDD3] text-xs">
                {students.map((stu) => {
                  const st = stats.find((x) => x.studentUid === stu.uid);
                  const online = isUserCurrentlyOnline(stu);
                  const isSelected = selectedStudentUids.has(stu.uid);

                  return (
                    <tr
                      key={stu.uid}
                      className={`transition-colors ${
                        isSelected ? 'bg-[#FBE3C8]/40' : 'bg-white/60 hover:bg-white/90'
                      }`}
                    >
                      <td className="py-3.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectStudent(stu.uid)}
                          className="w-4 h-4 rounded cursor-pointer accent-[#141413]"
                        />
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <AvatarIllustration avatarId={stu.avatarId} size="sm" />
                          <div className="min-w-0">
                            <p className="font-extrabold text-[#141413] truncate">
                              {stu.displayName}
                            </p>
                            <p className="text-[11px] text-[#6B665E] font-mono">
                              ID: {stu.studentLoginId}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`font-bold inline-flex items-center gap-1 ${
                            stu.accountStatus === 'inactive'
                              ? 'text-rose-600'
                              : online
                              ? 'text-emerald-700'
                              : 'text-[#6B665E]'
                          }`}
                        >
                          {online && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                          {stu.accountStatus === 'inactive'
                            ? '비활성 계정'
                            : online
                            ? '실시간 접속 중'
                            : '오프라인'}
                        </span>
                        <p className="text-[10px] text-[#787268] tabular-nums mt-0.5">
                          {stu.lastLoginAt ? stu.lastLoginAt.slice(0, 10) : '접속 기록 없음'}
                        </p>
                      </td>
                      <td className="py-3.5 px-3 font-extrabold text-[#141413] tabular-nums text-sm">
                        {st?.totalPoints ?? 0}점
                      </td>
                      <td className="py-3.5 px-3 tabular-nums text-[#3D3A35] font-semibold">
                        미션 {st?.completedMissionCount ?? 0}회 · 뱃지 {st?.earnedBadgeCount ?? 0}개
                      </td>
                      <td className="py-3.5 px-3 text-[#5C574F] whitespace-nowrap">
                        {stu.profileVisibility === 'private'
                          ? '🔒 나만 보기'
                          : stu.profileVisibility === 'manitto'
                          ? '💌 마니또 공개'
                          : '🏫 학급 전체 공개'}
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                          {/* 1234 Password Reset Button (Explicit Requirement) */}
                          <button
                            type="button"
                            onClick={() => setResetTargetStudent(stu)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#C6F0DF] text-[#065F46] font-extrabold hover:bg-[#A7E5CC] cursor-pointer whitespace-nowrap shadow-xs"
                            title="비밀번호를 초기 비밀번호 1234로 즉시 초기화"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>1234로 초기화</span>
                          </button>

                          {/* Adjust Score */}
                          <button
                            type="button"
                            onClick={() => setAdjustingStudent(stu)}
                            className="px-2.5 py-1.5 rounded-xl bg-[#FBE3C8] text-[#141413] font-extrabold hover:bg-[#F8D2AB] cursor-pointer whitespace-nowrap shadow-xs"
                          >
                            점수 조정
                          </button>

                          {/* Toggle Active Status */}
                          <button
                            type="button"
                            onClick={() => handleToggleAccountStatus(stu)}
                            className={`px-2.5 py-1.5 rounded-xl font-bold cursor-pointer whitespace-nowrap shadow-xs ${
                              stu.accountStatus === 'active'
                                ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                                : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            }`}
                          >
                            {stu.accountStatus === 'active' ? '비활성화' : '계정 복구'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =========================================================================
       * MODAL 1: Password Reset to '1234' Confirmation Modal
       * ======================================================================= */}
      {resetTargetStudent && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FBF9F5] rounded-[32px] max-w-md w-full p-6 space-y-4 shadow-xl border border-white">
            <div className="w-12 h-12 rounded-2xl bg-[#C6F0DF] flex items-center justify-center text-2xl mx-auto">
              🔑
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-extrabold text-[#141413]">
                {resetTargetStudent.displayName} 학생 비밀번호 초기화
              </h3>
              <p className="text-xs text-[#5C574F] leading-relaxed">
                비밀번호를 초기 비밀번호인 <strong className="text-[#065F46] font-extrabold">1234</strong> 로 즉시 초기화하시겠습니까?
              </p>
            </div>

            <div className="bg-[#F3EFEA] rounded-2xl p-3.5 text-xs text-[#4A463F] space-y-1">
              <p>• 학생 아이디: <strong>{resetTargetStudent.studentLoginId}</strong></p>
              <p>• 초기화 후 학생이 <span className="font-bold text-rose-600">1234</span>로 로그인하여 자신의 새 비밀번호로 다시 바꿀 수 있습니다.</p>
              <p>• 이 조치는 감사 로그에 영구 기록됩니다.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={resettingPw}
                onClick={() => setResetTargetStudent(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#EFECE6] text-xs font-bold text-[#4A463F] cursor-pointer hover:bg-[#E2DDD3]"
              >
                취소
              </button>
              <button
                type="button"
                disabled={resettingPw}
                onClick={handleConfirmResetPassword}
                className="flex-1 py-2.5 rounded-xl bg-[#065F46] text-white text-xs font-extrabold cursor-pointer hover:bg-[#044E39] shadow-xs"
              >
                {resettingPw ? '초기화 중...' : '1234로 즉시 초기화'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
       * MODAL 2: Batch Student Registration Modal
       * ======================================================================= */}
      {batchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FBF9F5] rounded-[32px] max-w-2xl w-full p-6 sm:p-8 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto border border-white">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2DDD3]">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#DDD5F8] flex items-center justify-center text-xl">
                  📋
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-[#141413]">
                    학생 일괄 등록
                  </h3>
                  <p className="text-xs text-[#6B665E]">
                    우리 반 학생 명단을 복사하여 붙여넣으면 계정이 한 번에 발급됩니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBatchModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#EFECE6] flex items-center justify-center text-sm font-bold cursor-pointer hover:bg-[#E2DDD3]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-[#141413] mb-1.5">
                  1. 아이디 영문 접두사 (자동 번호가 부여됩니다)
                </label>
                <input
                  type="text"
                  value={batchPrefix}
                  onChange={(e) => setBatchPrefix(e.target.value.trim().toLowerCase())}
                  placeholder="예: shindong"
                  className="w-full sm:w-60 rounded-xl bg-[#F3EFEA] px-3.5 py-2 text-xs text-[#141413] font-bold focus:outline-none focus:ring-2 focus:ring-[#141413]"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-[#141413] mb-1.5">
                  2. 학생 이름 목록 붙여넣기 (한 줄에 한 명 또는 쉼표 구분)
                </label>
                <textarea
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  rows={6}
                  placeholder={`예시:\n김민수\n이영희\n박철수\n최도윤\n정지우\n1번 강시우`}
                  className="w-full rounded-2xl bg-[#F3EFEA] p-4 text-xs font-mono text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#141413]"
                />
              </div>

              {/* Parsed Preview Table */}
              {parsedBatchStudents.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#141413]">
                    <span>인식된 학생 명단: 총 {parsedBatchStudents.length}명</span>
                    <span className="text-[11px] text-[#065F46] font-semibold">초기 비밀번호: 1234 자동 적용</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto bg-white rounded-2xl border border-[#E2DDD3] p-3 divide-y divide-[#EFECE6]">
                    {parsedBatchStudents.map((s, idx) => (
                      <div key={idx} className="py-1.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-6 text-[10px] text-[#8C827A] tabular-nums font-bold">
                            {idx + 1}.
                          </span>
                          <span className="font-extrabold text-[#141413]">{s.displayName}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[11px] text-[#6B665E]">ID: {s.studentLoginId}</span>
                          <span className="text-[10px] bg-[#E2F2EA] text-[#065F46] px-2 py-0.5 rounded-lg font-bold">PW: 1234</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2DDD3]">
              <button
                type="button"
                disabled={batchCreating}
                onClick={() => setBatchModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-[#EFECE6] text-xs font-bold text-[#4A463F] cursor-pointer hover:bg-[#E2DDD3]"
              >
                닫기
              </button>
              <button
                type="button"
                disabled={parsedBatchStudents.length === 0 || batchCreating}
                onClick={handleBatchCreateSubmit}
                className="px-5 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-extrabold hover:bg-[#2C2A27] cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {batchCreating
                  ? '일괄 등록 처리 중...'
                  : `총 ${parsedBatchStudents.length}명 학생 계정 일괄 등록하기 →`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
       * MODAL 3: Batch Deletion Confirmation Modal
       * ======================================================================= */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FBF9F5] rounded-[32px] max-w-md w-full p-6 space-y-4 shadow-xl border border-rose-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-2xl mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-extrabold text-[#141413]">
                {isDeletingAll ? '전체 학생 계정 일괄 삭제' : '선택한 학생 계정 일괄 삭제'}
              </h3>
              <p className="text-xs text-rose-700 font-bold leading-relaxed">
                {isDeletingAll
                  ? `학급의 모든 학생(${students.length}명) 계정을 완전히 삭제하시겠습니까?`
                  : `선택한 ${selectedStudentUids.size}명의 학생 계정을 완전히 삭제하시겠습니까?`}
              </p>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 text-xs text-rose-800 space-y-1">
              <p className="font-extrabold">• 경고: 이 작업은 되돌릴 수 없습니다.</p>
              <p>• 해당 학생들의 미션 실천 기록, 점수, 획득 뱃지 데이터가 함께 정리됩니다.</p>
              <p>• 교사 관리자 계정은 삭제되지 않고 안전하게 유지됩니다.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deletingBatch}
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setIsDeletingAll(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#EFECE6] text-xs font-bold text-[#4A463F] cursor-pointer hover:bg-[#E2DDD3]"
              >
                취소
              </button>
              <button
                type="button"
                disabled={deletingBatch}
                onClick={handleExecuteBatchDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-extrabold cursor-pointer hover:bg-rose-700 shadow-xs"
              >
                {deletingBatch ? '삭제 중...' : '확인, 영구 삭제 실행'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Score Adjustment Modal */}
      {adjustingStudent && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleScoreAdjustmentSubmit}
            className="bg-[#FBF9F5] rounded-[28px] max-w-md w-full p-6 space-y-4 shadow-xl border border-white"
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
                className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2 text-sm tabular-nums font-bold"
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
                className="px-4 py-2 rounded-xl bg-[#EFECE6] text-xs font-bold cursor-pointer hover:bg-[#E2DDD3]"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#141413] text-white text-xs font-bold cursor-pointer hover:bg-[#2C2A27]"
              >
                원장 반영 및 저장
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================================
       * MODAL 4: Full Activity Reset Confirmation Modal
       * ======================================================================= */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FBF9F5] rounded-[32px] max-w-md w-full p-6 space-y-4 shadow-xl border border-amber-300">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center text-2xl mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-extrabold text-[#141413]">
                학급 전체 활동 기록 초기화
              </h3>
              <p className="text-xs text-amber-900 font-bold leading-relaxed">
                학생 계정은 그대로 보존하고, 지금까지 실천한 모든 마니또 활동 기록을 0으로 깔끔하게 리셋하시겠습니까?
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 space-y-1.5">
              <p className="font-extrabold text-[#92400E]">• 초기화 대상 데이터:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-[#78350F]">
                <li>모든 미션 실천 인증 기록 (MissionSubmissions)</li>
                <li>점수 변동 원장 내역 (ScoreLedger) 및 학생 누적 점수 (0점으로 리셋)</li>
                <li>획득한 뱃지 내역 (BadgeAwards)</li>
                <li>익명 편지함 송수신 기록 (Letters & Threads)</li>
                <li>익명 라운지 대화 메시지 (LoungeMessages)</li>
              </ul>
              <p className="font-extrabold text-emerald-800 pt-1">
                ✓ 학생 계정(아이디/비밀번호) 및 교사 계정, 미션 20종은 안전하게 유지됩니다.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={resettingActivities}
                onClick={() => setResetModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#EFECE6] text-xs font-bold text-[#4A463F] cursor-pointer hover:bg-[#E2DDD3]"
              >
                취소
              </button>
              <button
                type="button"
                disabled={resettingActivities}
                onClick={handleConfirmResetActivities}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-extrabold cursor-pointer hover:bg-amber-700 shadow-xs"
              >
                {resettingActivities ? '초기화 진행 중...' : '확인, 활동 데이터 초기화'}
              </button>
            </div>
          </div>
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
/* ============================================================================
 * 4. TEACHER MISSION MANAGEMENT & APPROVAL VIEW
 * ========================================================================== */
const TeacherMissionsView: React.FC<TeacherContextProps> = ({
  workspaceOwnerUid,
  teacherProfile,
  allUsers,
  missions,
  submissions,
  badges,
  badgeAwards,
  letters,
  onNotify,
}) => {
  // Submission Filter & Search State
  const [subFilterTab, setSubFilterTab] = useState<'pending' | 'auto' | 'approved' | 'rejected' | 'all'>('pending');
  const [subCategoryFilter, setSubCategoryFilter] = useState<string>('all');
  const [subSearchQuery, setSubSearchQuery] = useState('');
  const [expandedSubIds, setExpandedSubIds] = useState<Set<string>>(new Set());
  const [approvingAll, setApprovingAll] = useState(false);

  // Rejection Comment Modal / Prompt State
  const [rejectModalSub, setRejectModalSub] = useState<MissionSubmission | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  // Deletion Confirmation State
  const [deleteModalSub, setDeleteModalSub] = useState<MissionSubmission | null>(null);
  const [deleteReasonInput, setDeleteReasonInput] = useState('');

  // Add Custom Mission State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [howTo, setHowTo] = useState('');
  const [points, setPoints] = useState(10);
  const [category, setCategory] = useState<MissionCategory>('kindness');
  const [requiresApproval, setRequiresApproval] = useState(false);

  const students = useMemo(
    () => allUsers.filter((u) => u.role === 'student'),
    [allUsers]
  );

  const sortedMissions = useMemo(
    () => [...missions].sort((a, b) => a.orderIndex - b.orderIndex),
    [missions]
  );

  // Category list and counts for Mission Type Tabs
  const CATEGORIES = useMemo(
    () => [
      { id: 'all', label: '전체 유형', icon: '🏷️' },
      { id: 'kindness', label: '친절', icon: '💖' },
      { id: 'care', label: '배려', icon: '🌿' },
      { id: 'observation', label: '관찰', icon: '🔍' },
      { id: 'gratitude', label: '감사', icon: '🙏' },
      { id: 'cooperation', label: '협동', icon: '🤝' },
    ],
    []
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: submissions.length };
    submissions.forEach((sub) => {
      const mis = missions.find((m) => m.missionId === sub.missionId);
      const cat = mis?.category || 'other';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [submissions, missions]);

  // Counts for Submission Status Tabs
  const pendingCount = useMemo(
    () => submissions.filter((s) => s.status === 'pending').length,
    [submissions]
  );
  const autoApprovedCount = useMemo(
    () => submissions.filter((s) => s.status === 'approved' && s.reviewedBy === 'system_auto').length,
    [submissions]
  );
  const teacherApprovedCount = useMemo(
    () => submissions.filter((s) => s.status === 'approved' && s.reviewedBy !== 'system_auto').length,
    [submissions]
  );
  const rejectedOrDeletedCount = useMemo(
    () => submissions.filter((s) => s.status === 'rejected' || s.status === 'deleted').length,
    [submissions]
  );

  // Filtered Submissions List (by status, category, and search query)
  const filteredSubmissions = useMemo(() => {
    return submissions
      .filter((sub) => {
        if (subFilterTab === 'pending') return sub.status === 'pending';
        if (subFilterTab === 'auto') return sub.status === 'approved' && sub.reviewedBy === 'system_auto';
        if (subFilterTab === 'approved') return sub.status === 'approved' && sub.reviewedBy !== 'system_auto';
        if (subFilterTab === 'rejected') return sub.status === 'rejected' || sub.status === 'deleted';
        return true;
      })
      .filter((sub) => {
        if (subCategoryFilter === 'all') return true;
        const mis = missions.find((m) => m.missionId === sub.missionId);
        return mis?.category === subCategoryFilter;
      })
      .filter((sub) => {
        if (!subSearchQuery.trim()) return true;
        const q = subSearchQuery.trim().toLowerCase();
        const stu = students.find((s) => s.uid === sub.studentUid);
        const mis = missions.find((m) => m.missionId === sub.missionId);
        return (
          (stu?.displayName && stu.displayName.toLowerCase().includes(q)) ||
          (stu?.studentLoginId && stu.studentLoginId.toLowerCase().includes(q)) ||
          (mis?.title && mis.title.toLowerCase().includes(q)) ||
          sub.actionDescription.toLowerCase().includes(q) ||
          sub.reflection.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Pending submissions always on top
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return b.activityDate.localeCompare(a.activityDate);
      });
  }, [submissions, subFilterTab, subCategoryFilter, subSearchQuery, students, missions]);

  // Toggle Single Fold / Unfold
  const toggleSubExpand = (subId: string) => {
    setExpandedSubIds((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  };

  // Toggle All Expand / Collapse
  const handleToggleExpandAll = () => {
    if (expandedSubIds.size === filteredSubmissions.length && filteredSubmissions.length > 0) {
      setExpandedSubIds(new Set());
    } else {
      setExpandedSubIds(new Set(filteredSubmissions.map((s) => s.submissionId)));
    }
  };

  // Batch Approve All Pending Submissions Action
  const handleApproveAllPending = async () => {
    const pendingSubs = submissions.filter((s) => s.status === 'pending');
    if (pendingSubs.length === 0 || approvingAll) {
      onNotify('현재 승인 대기 중인 미션이 없습니다.', 'info');
      return;
    }

    if (!window.confirm(`현재 승인 대기 중인 ${pendingSubs.length}건의 미션을 모두 일괄 승인하시겠습니까?`)) {
      return;
    }

    setApprovingAll(true);
    let successCount = 0;
    try {
      let currentSubmissions = [...submissions];
      for (const sub of pendingSubs) {
        const mis = missions.find((m) => m.missionId === sub.missionId);
        const pts = mis?.points || 10;
        const title = mis?.title || '미션';

        await reviewMissionSubmission({
          workspaceOwnerUid,
          teacherUid: teacherProfile.uid,
          teacherName: teacherProfile.displayName,
          submission: sub,
          missionTitle: title,
          missionPoints: pts,
          decision: 'approved',
          reviewComment: '선생님이 대기 미션을 일괄 승인했습니다! 참 잘했어요 🌸',
        });

        currentSubmissions = currentSubmissions.map((s) =>
          s.submissionId === sub.submissionId ? { ...s, status: 'approved' as const } : s
        );

        await evaluateAndAwardBadges({
          workspaceOwnerUid,
          studentUid: sub.studentUid,
          classId: sub.classId,
          missions,
          submissions: currentSubmissions,
          sentLettersCount: letters.filter((l) => l.senderUid === sub.studentUid).length,
          badges,
          existingAwards: badgeAwards,
        });

        successCount++;
      }

      onNotify(`승인 대기 중인 미션 ${successCount}건이 모두 일괄 승인되었습니다! 🎉`, 'success');
    } catch (err) {
      onNotify(`일괄 승인 중 오류 발생: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setApprovingAll(false);
    }
  };

  // Approve Mission Action
  const handleApproveSubmission = async (sub: MissionSubmission) => {
    const mis = missions.find((m) => m.missionId === sub.missionId);
    if (!mis || reviewingId) return;
    setReviewingId(sub.submissionId);
    try {
      await reviewMissionSubmission({
        workspaceOwnerUid,
        teacherUid: teacherProfile.uid,
        teacherName: teacherProfile.displayName,
        submission: sub,
        missionTitle: mis.title,
        missionPoints: mis.points,
        decision: 'approved',
        reviewComment: '선생님이 실천 기록을 확인하고 승인했어요! 칭찬합니다 🌸',
      });

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

      onNotify(`미션 승인 완료! 학생에게 +${mis.points}점이 즉시 지급되었습니다.`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '승인 실패', 'error');
    } finally {
      setReviewingId(null);
    }
  };

  // Reject Mission Action
  const handleRejectSubmissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalSub) return;
    const mis = missions.find((m) => m.missionId === rejectModalSub.missionId);
    const comment = rejectReasonInput.trim() || '실천 내용을 조금 더 구체적으로 보완하여 다시 도전해 볼까요?';

    setReviewingId(rejectModalSub.submissionId);
    try {
      await reviewMissionSubmission({
        workspaceOwnerUid,
        teacherUid: teacherProfile.uid,
        teacherName: teacherProfile.displayName,
        submission: rejectModalSub,
        missionTitle: mis?.title || '미션',
        missionPoints: mis?.points || 0,
        decision: 'rejected',
        reviewComment: comment,
      });

      onNotify('미션이 반려 처리되었습니다.', 'info');
      setRejectModalSub(null);
      setRejectReasonInput('');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '반려 처리 실패', 'error');
    } finally {
      setReviewingId(null);
    }
  };

  // Delete Mission Submission Action
  const handleDeleteSubmissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteModalSub) return;
    const mis = missions.find((m) => m.missionId === deleteModalSub.missionId);
    const comment = deleteReasonInput.trim() || '교사 요청에 의한 부적절/중복 활동 기록 삭제';

    setReviewingId(deleteModalSub.submissionId);
    try {
      await reviewMissionSubmission({
        workspaceOwnerUid,
        teacherUid: teacherProfile.uid,
        teacherName: teacherProfile.displayName,
        submission: deleteModalSub,
        missionTitle: mis?.title || '미션',
        missionPoints: mis?.points || 0,
        decision: 'deleted',
        reviewComment: comment,
      });

      onNotify('활동 기록이 완전히 삭제 처리되고 지급되었던 점수가 차감되었습니다.', 'info');
      setDeleteModalSub(null);
      setDeleteReasonInput('');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '삭제 처리 실패', 'error');
    } finally {
      setReviewingId(null);
    }
  };

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
    <div className="space-y-8 w-full">
      {/* View Header */}
      <div>
        <p className="text-xs font-semibold text-[#6B665E] mb-1">
          미션 제출 검토 및 승인 · 자동 승인 내역 확인 · 신규 미션 설정
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
          미션 제출 승인 및 미션 목록 관리
        </h1>
      </div>

      {/* =========================================================================
       * SECTION 1: STUDENT MISSION SUBMISSIONS & APPROVAL DASHBOARD (STATUS-GROUPED COLLAPSIBLE)
       * ======================================================================= */}
      <div className="bg-[#F3EFEA] rounded-[28px] p-5 sm:p-7 space-y-6 border border-[#E2DDD3]">
        {/* Section Header & Search & Batch Approve */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2DDD3] pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-extrabold text-[#141413]">
                📌 학생 미션 실천 및 승인 관리
              </h2>
              {pendingCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-xs font-extrabold animate-pulse">
                  승인 대기 {pendingCount}건
                </span>
              )}
            </div>
            <p className="text-xs text-[#6B665E] mt-0.5">
              승인 상태 및 미션 유형별로 제출 내역을 필터링하고, 대기 중인 항목을 개별 또는 일괄 승인할 수 있습니다.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* Batch Approve All Button */}
            {pendingCount > 0 && (
              <button
                type="button"
                disabled={approvingAll}
                onClick={handleApproveAllPending}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-extrabold hover:bg-amber-600 transition-colors cursor-pointer shadow-xs whitespace-nowrap flex items-center gap-1.5"
                title="승인 대기 중인 모든 미션을 한 번에 승인합니다."
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{approvingAll ? '일괄 승인 중...' : `⚡ 대기 미션 전체 승인 (${pendingCount}건)`}</span>
              </button>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#8C827A]" />
              <input
                type="text"
                value={subSearchQuery}
                onChange={(e) => setSubSearchQuery(e.target.value)}
                placeholder="학생 이름 / 미션 검색..."
                className="pl-8 pr-3 py-1.5 rounded-xl bg-white text-xs font-bold text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#141413] w-36 sm:w-48"
              />
            </div>

            {/* Expand / Collapse All Toggle */}
            <button
              type="button"
              onClick={handleToggleExpandAll}
              className="px-3 py-1.5 rounded-xl bg-white text-[#141413] text-xs font-extrabold hover:bg-[#141413] hover:text-white transition-colors cursor-pointer shadow-xs whitespace-nowrap"
            >
              {expandedSubIds.size === filteredSubmissions.length && filteredSubmissions.length > 0
                ? '항목 전체 접기 ▴'
                : '항목 전체 펼치기 ▾'}
            </button>
          </div>
        </div>

        {/* Filter Tab Rows: 1) Status Filter, 2) Mission Category Filter */}
        <div className="space-y-2.5">
          {/* Row 1: Status Filter Quick Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
            <span className="text-[11px] font-extrabold text-[#6B665E] shrink-0 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-[#8C827A]" />
              승인 상태:
            </span>
            <button
              type="button"
              onClick={() => setSubFilterTab('pending')}
              className={`px-3 py-1.5 rounded-xl font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                subFilterTab === 'pending'
                  ? 'bg-[#141413] text-white shadow-xs'
                  : 'bg-white/80 text-[#5C574F] hover:bg-white'
              }`}
            >
              <span>⏳ 승인 대기 목록</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
                subFilterTab === 'pending' ? 'bg-amber-400 text-[#141413]' : 'bg-amber-100 text-amber-800'
              }`}>
                {pendingCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSubFilterTab('auto')}
              className={`px-3 py-1.5 rounded-xl font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                subFilterTab === 'auto'
                  ? 'bg-[#141413] text-white shadow-xs'
                  : 'bg-white/80 text-[#5C574F] hover:bg-white'
              }`}
            >
              <span>⚡ 자동 승인 내역</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
                subFilterTab === 'auto' ? 'bg-[#C6F0DF] text-[#065F46]' : 'bg-[#E2F2EA] text-[#065F46]'
              }`}>
                {autoApprovedCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSubFilterTab('approved')}
              className={`px-3 py-1.5 rounded-xl font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                subFilterTab === 'approved'
                  ? 'bg-[#141413] text-white shadow-xs'
                  : 'bg-white/80 text-[#5C574F] hover:bg-white'
              }`}
            >
              <span>✅ 교사 승인 완료</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-100 text-sky-800 tabular-nums">
                {teacherApprovedCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSubFilterTab('rejected')}
              className={`px-3 py-1.5 rounded-xl font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                subFilterTab === 'rejected'
                  ? 'bg-[#141413] text-white shadow-xs'
                  : 'bg-white/80 text-[#5C574F] hover:bg-white'
              }`}
            >
              <span>❌ 반려 / 삭제됨</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 text-rose-800 tabular-nums">
                {rejectedOrDeletedCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSubFilterTab('all')}
              className={`px-3 py-1.5 rounded-xl font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                subFilterTab === 'all'
                  ? 'bg-[#141413] text-white shadow-xs'
                  : 'bg-white/80 text-[#5C574F] hover:bg-white'
              }`}
            >
              <span>📋 전체 보기</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-gray-200 text-gray-800 tabular-nums">
                {submissions.length}
              </span>
            </button>
          </div>

          {/* Row 2: Mission Category Type Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none pt-2 border-t border-[#E2DDD3]/60">
            <span className="text-[11px] font-extrabold text-[#6B665E] shrink-0 mr-1 flex items-center gap-1">
              <Zap className="w-3 h-3 text-[#8C827A]" />
              미션 유형별:
            </span>
            {CATEGORIES.map((cat) => {
              const count = categoryCounts[cat.id] || 0;
              const isActive = subCategoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSubCategoryFilter(cat.id)}
                  className={`px-3 py-1 rounded-xl font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 text-xs ${
                    isActive
                      ? 'bg-[#141413] text-white shadow-xs'
                      : 'bg-white/80 text-[#5C574F] hover:bg-white border border-[#E2DDD3]/80'
                  }`}
                >
                  <span>{cat.icon} {cat.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
                      isActive ? 'bg-white/20 text-white' : 'bg-[#E2DDD3] text-[#4A463F]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* =====================================================================
         * STATUS-GROUPED SUBMISSION CARDS LIST
         * =================================================================== */}
        {filteredSubmissions.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center space-y-2 border border-[#E2DDD3]">
            <div className="text-3xl">🍃</div>
            <p className="text-xs font-bold text-[#141413]">
              {subFilterTab === 'pending'
                ? '현재 선생님 확인이 필요한 승인 대기 미션이 없습니다!'
                : subFilterTab === 'auto'
                ? '자동 승인된 미션 기록이 없습니다.'
                : '해당하는 미션 제출 기록이 없습니다.'}
            </p>
            <p className="text-[11px] text-[#6B665E]">
              학생들이 미션을 실천하고 제출하면 이곳에 수신됩니다.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSubmissions.map((sub) => {
              const stu = students.find((s) => s.uid === sub.studentUid);
              const mis = missions.find((m) => m.missionId === sub.missionId);
              const isExpanded = expandedSubIds.has(sub.submissionId);
              const isPending = sub.status === 'pending';
              const isAutoApproved = sub.status === 'approved' && sub.reviewedBy === 'system_auto';
              const isTeacherApproved = sub.status === 'approved' && sub.reviewedBy !== 'system_auto';
              const todayStr = new Date().toISOString().slice(0, 10);
              const isRecent = sub.activityDate === todayStr || isPending;

              return (
                <div
                  key={sub.submissionId}
                  className={`bg-white rounded-2xl border transition-all overflow-hidden ${
                    isPending
                      ? 'border-amber-400 ring-2 ring-amber-200 shadow-md bg-amber-50/40'
                      : isRecent
                      ? 'border-amber-300 ring-1 ring-amber-200/60 shadow-xs bg-amber-50/20'
                      : isAutoApproved
                      ? 'border-emerald-200 hover:border-emerald-300 shadow-xs'
                      : 'border-[#E2DDD3] hover:border-[#C5BEB2] shadow-xs'
                  }`}
                >
                  {/* Summary Header Bar (Always Visible) */}
                  <div
                    onClick={() => toggleSubExpand(sub.submissionId)}
                    className="p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none hover:bg-gray-50/80 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <AvatarIllustration avatarId={stu?.avatarId || 'rabbit'} size="sm" />
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-xs font-extrabold text-[#141413]">
                            {stu?.displayName || '학생'}
                          </strong>
                          <span className="text-[10px] text-[#6B665E] font-mono">
                            ({stu?.studentLoginId || 'ID'})
                          </span>
                          <span className="text-[#B5AF9E]">|</span>
                          <span className="text-xs font-bold text-[#3D3A35]">
                            {mis?.title || '마니또 미션'}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-[#F3EFEA] text-[10px] font-extrabold text-[#141413] tabular-nums">
                            +{mis?.points || sub.awardedPoints}점
                          </span>
                          {isRecent && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold shadow-xs animate-pulse">
                              ✨ 최근 제출됨
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-[#5C574F] truncate max-w-md sm:max-w-xl">
                          💬 {sub.actionDescription}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 justify-between sm:justify-end">
                      <span className="text-[11px] text-[#6B665E] font-mono tabular-nums">
                        실천일: {sub.activityDate}
                      </span>

                      {/* Status & Explicit Tag Badges */}
                      {isPending ? (
                        <span className="px-2.5 py-1 rounded-xl bg-amber-100 text-amber-900 text-[11px] font-extrabold flex items-center gap-1 border border-amber-300">
                          <span>⏳ 승인 대기</span>
                        </span>
                      ) : isAutoApproved ? (
                        <span className="px-2.5 py-1 rounded-xl bg-[#E2F2EA] text-[#065F46] text-[11px] font-extrabold flex items-center gap-1 border border-emerald-300 shadow-xs">
                          <Zap className="w-3.5 h-3.5 text-[#065F46]" />
                          <span>자동 승인</span>
                        </span>
                      ) : isTeacherApproved ? (
                        <span className="px-2.5 py-1 rounded-xl bg-sky-100 text-sky-800 text-[11px] font-extrabold flex items-center gap-1 border border-sky-200">
                          <span>✅ 교사 승인</span>
                        </span>
                      ) : sub.status === 'deleted' ? (
                        <span className="px-2.5 py-1 rounded-xl bg-gray-100 text-gray-700 text-[11px] font-bold">
                          🗑️ 삭제됨 (점수회수)
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-xl bg-rose-100 text-rose-800 text-[11px] font-bold">
                          ❌ 반려됨
                        </span>
                      )}

                      {/* Accordion Toggle Icon Button */}
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#F3EFEA] text-[11px] font-bold text-[#141413] hover:bg-[#E2DDD3]">
                        {isExpanded ? (
                          <>
                            <span>접기</span>
                            <ChevronUp className="w-3.5 h-3.5 text-[#141413]" />
                          </>
                        ) : (
                          <>
                            <span>상세</span>
                            <ChevronDown className="w-3.5 h-3.5 text-[#141413]" />
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Direct Action Bar for Pending Submissions */}
                  {isPending && (
                    <div className="bg-amber-50/90 px-4 py-2.5 border-t border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <span className="text-amber-900 font-bold text-[11px]">
                        💡 교사의 확인 및 승인이 필요한 미션입니다. 내용 확인 후 즉시 처리해 주세요.
                      </span>
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRejectModalSub(sub);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-rose-100 text-rose-800 font-extrabold text-xs hover:bg-rose-200 cursor-pointer shadow-xs"
                        >
                          반려 처리
                        </button>
                        <button
                          type="button"
                          disabled={reviewingId === sub.submissionId}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApproveSubmission(sub);
                          }}
                          className="px-4 py-1.5 rounded-xl bg-[#141413] text-white font-extrabold text-xs hover:bg-[#2C2A27] cursor-pointer shadow-xs"
                        >
                          {reviewingId === sub.submissionId ? '승인 처리 중...' : `승인 및 점수 지급 (+${mis?.points || 10}점)`}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Expanded Body View (Shows '시스템 자동 처리' explicitly for auto-approved) */}
                  {isExpanded && (
                    <div className="p-4 sm:p-5 bg-[#FBF9F5] border-t border-[#E2DDD3] space-y-4 text-xs animate-fadeIn">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white rounded-xl p-3.5 border border-[#E8E4DC] space-y-1.5">
                          <p className="font-extrabold text-[#141413] flex items-center gap-1 text-[11px]">
                            <span>📝</span> 실제로 한 행동 (실천 내용)
                          </p>
                          <p className="text-[#3D3A35] leading-relaxed font-semibold">
                            {sub.actionDescription}
                          </p>
                        </div>

                        <div className="bg-white rounded-xl p-3.5 border border-[#E8E4DC] space-y-1.5">
                          <p className="font-extrabold text-[#141413] flex items-center gap-1 text-[11px]">
                            <span>💭</span> 실천 후 느낀 점 (마음 소감)
                          </p>
                          <p className="text-[#5C574F] leading-relaxed font-medium">
                            {sub.reflection}
                          </p>
                        </div>
                      </div>

                      {/* Evidence & Explicit System Auto / Teacher Review Info Bar */}
                      <div className="bg-white rounded-xl p-3.5 border border-[#E8E4DC] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] text-[#5C574F]">
                        <div className="space-y-1">
                          <p>
                            📌 <strong>증빙/참고 노트:</strong> {sub.evidenceNote || '제출된 증빙 메모 없음'}
                          </p>
                          <p>
                            ⚙️ <strong>승인 및 처리 정보:</strong>{' '}
                            {sub.reviewedBy === 'system_auto' ? (
                              <span className="text-[#065F46] font-extrabold bg-[#E2F2EA] px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                <Zap className="w-3 h-3 text-[#065F46]" />
                                시스템 자동 처리 (미션 실천 기록 제출 시 즉시 승인 및 점수 반영됨)
                              </span>
                            ) : sub.reviewedBy ? (
                              <span className="text-[#141413] font-bold">👨‍🏫 교사 승인 완료 ({sub.reviewedBy})</span>
                            ) : (
                              <span className="text-amber-800 font-bold">⏳ 교사 확인 및 승인 대기 중</span>
                            )}
                          </p>
                        </div>

                        {sub.reviewComment && (
                          <div className="bg-[#F3EFEA] rounded-lg p-2.5 border border-[#E2DDD3] shrink-0 max-w-sm">
                            <p className="font-bold text-[#141413]">💬 선생님 코멘트/피드백:</p>
                            <p className="text-[#3D3A35] mt-0.5">{sub.reviewComment}</p>
                          </div>
                        )}
                      </div>

                      {/* Expanded Action Buttons */}
                      <div className="flex items-center justify-between pt-2 border-t border-[#E8E4DC]">
                        <button
                          type="button"
                          onClick={() => setDeleteModalSub(sub)}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 font-bold hover:bg-rose-100 cursor-pointer text-xs"
                        >
                          🗑️ 활동 기록 숨김/삭제 (지급 점수 회수)
                        </button>

                        <div className="flex items-center gap-2">
                          {isPending ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setRejectModalSub(sub)}
                                className="px-3.5 py-1.5 rounded-xl bg-rose-100 text-rose-800 font-extrabold hover:bg-rose-200 cursor-pointer text-xs"
                              >
                                반려 처리하기
                              </button>
                              <button
                                type="button"
                                disabled={reviewingId === sub.submissionId}
                                onClick={() => handleApproveSubmission(sub)}
                                className="px-4 py-2 rounded-xl bg-[#141413] text-white font-extrabold hover:bg-[#2C2A27] cursor-pointer text-xs shadow-xs"
                              >
                                {reviewingId === sub.submissionId ? '승인 처리 중...' : `확인 완료, 미션 승인 및 +${mis?.points || 10}점 지급`}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleSubExpand(sub.submissionId)}
                              className="px-3 py-1.5 rounded-xl bg-[#EFECE6] text-[#4A463F] font-bold hover:bg-[#E2DDD3] cursor-pointer text-xs"
                            >
                              상세 접기 ▴
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =========================================================================
       * MODAL A: Rejection Reason Modal
       * ======================================================================= */}
      {rejectModalSub && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleRejectSubmissionSubmit}
            className="bg-[#FBF9F5] rounded-[32px] max-w-md w-full p-6 space-y-4 shadow-xl border border-white"
          >
            <h3 className="text-lg font-extrabold text-[#141413]">
              미션 제출 반려 처리
            </h3>
            <p className="text-xs text-[#5C574F]">
              학생에게 전달될 반려 사유 또는 보완 코멘트를 입력해 주세요.
            </p>
            <div>
              <label className="block text-xs font-bold text-[#141413] mb-1">
                반려 코멘트 (학생 알림용)
              </label>
              <textarea
                rows={3}
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
                placeholder="예: 실천한 내용을 조금 더 구체적으로 작성해 주세요! 내일 다시 도전해 봐요."
                className="w-full rounded-xl bg-white border border-[#E2DDD3] p-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#141413]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRejectModalSub(null)}
                className="px-4 py-2.5 rounded-xl bg-[#EFECE6] text-xs font-bold text-[#4A463F] cursor-pointer hover:bg-[#E2DDD3]"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={Boolean(reviewingId)}
                className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-extrabold cursor-pointer hover:bg-rose-700 shadow-xs"
              >
                {reviewingId ? '처리 중...' : '확인, 반려 처리하기'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================================
       * MODAL B: Deletion & Score Reversal Modal
       * ======================================================================= */}
      {deleteModalSub && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleDeleteSubmissionSubmit}
            className="bg-[#FBF9F5] rounded-[32px] max-w-md w-full p-6 space-y-4 shadow-xl border border-rose-200"
          >
            <h3 className="text-lg font-extrabold text-[#141413]">
              활동 기록 삭제 및 지급 점수 회수
            </h3>
            <p className="text-xs text-rose-700 font-bold">
              기록이 삭제되며 이미 지급되었던 점수는 학생의 총점에서 자동 차감됩니다.
            </p>
            <div>
              <label className="block text-xs font-bold text-[#141413] mb-1">
                삭제 사유 (감사 로그에 기록됩니다)
              </label>
              <input
                type="text"
                value={deleteReasonInput}
                onChange={(e) => setDeleteReasonInput(e.target.value)}
                placeholder="예: 부적절 표현 포함 또는 중복 등록 기록 정리"
                required
                className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#141413]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteModalSub(null)}
                className="px-4 py-2.5 rounded-xl bg-[#EFECE6] text-xs font-bold text-[#4A463F] cursor-pointer hover:bg-[#E2DDD3]"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={Boolean(reviewingId)}
                className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-extrabold cursor-pointer hover:bg-rose-700 shadow-xs"
              >
                {reviewingId ? '삭제 중...' : '확인, 영구 삭제 및 점수 회수'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================================
       * SECTION 2: CLASSROOM MISSION DEFINITIONS & ADD MISSION FORM
       * ======================================================================= */}
      <div className="space-y-4 pt-4 border-t border-[#E2DDD3]">
        <div>
          <h2 className="text-xl font-extrabold text-[#141413]">
            ⚙️ 학급 마니또 미션 목록 및 새 미션 등록 ({sortedMissions.length}개)
          </h2>
          <p className="text-xs text-[#6B665E] mt-0.5">
            우리 반 실정에 맞는 특별 마니또 미션을 추가하고 점수 및 교사 승인 여부를 설정합니다.
          </p>
        </div>

        {/* Add Mission Form */}
        <form
          onSubmit={handleAddMission}
          className="bg-[#F3EFEA] rounded-[28px] p-6 space-y-4 border border-[#E2DDD3]"
        >
          <h3 className="text-sm font-extrabold text-[#141413]">+ 새 마니또 미션 추가하기</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="미션 제목 (예: 급식 시간에 감사 인사하기)"
              required
              className="rounded-xl bg-white px-3.5 py-2.5 text-xs font-bold text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#141413]"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as MissionCategory)}
              className="rounded-xl bg-white px-3.5 py-2.5 text-xs font-bold text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#141413]"
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
                className="w-20 rounded-xl bg-white px-3 py-2.5 text-xs font-bold tabular-nums text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#141413]"
              />
              <span className="text-xs font-bold text-[#141413]">점</span>
              <label className="flex items-center gap-1.5 text-xs font-bold text-[#141413] ml-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requiresApproval}
                  onChange={(e) => setRequiresApproval(e.target.checked)}
                  className="w-4 h-4 accent-[#141413] cursor-pointer"
                />
                <span>교사 승인 필요</span>
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
              className="flex-1 rounded-xl bg-white px-3.5 py-2.5 text-xs text-[#141413] focus:outline-none focus:ring-2 focus:ring-[#141413]"
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-extrabold hover:bg-[#2C2A27] cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
            >
              미션 등록
            </button>
          </div>
        </form>

        {/* Missions Definitions List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {sortedMissions.map((m) => (
            <div
              key={m.missionId}
              className={`rounded-2xl p-4 flex items-center justify-between gap-3 border transition-all ${
                m.active
                  ? 'bg-white border-[#E2DDD3] shadow-xs'
                  : 'bg-[#EFECE6] border-gray-300 opacity-60'
              }`}
            >
              <div>
                <p className="text-xs font-extrabold text-[#141413]">
                  {String(m.orderIndex).padStart(2, '0')}. {m.title} (+{m.points}점)
                </p>
                <p className="text-[11px] text-[#5C574F] mt-0.5">
                  {m.requiresTeacherApproval ? '🔒 선생님 확인 후 승인' : '⚡ 실천 기록 시 자동 승인'} · 최대{' '}
                  {m.maxCompletions}회
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleMissionActive(m)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer shrink-0 transition-colors shadow-xs ${
                  m.active ? 'bg-[#F3EFEA] text-[#141413] hover:bg-[#E2DDD3]' : 'bg-[#141413] text-white hover:bg-[#2C2A27]'
                }`}
              >
                {m.active ? '활성 중' : '비활성'}
              </button>
            </div>
          ))}
        </div>
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
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [modalGiverUid, setModalGiverUid] = useState<string>('');
  const [modalReceiverUid, setModalReceiverUid] = useState<string>('');
  const [savingManual, setSavingManual] = useState(false);

  const activeStudents = useMemo(
    () => allUsers.filter((u) => u.role === 'student' && u.accountStatus === 'active'),
    [allUsers]
  );

  // Full Shuffle covering 100% of registered active students
  const handleShuffleAssignments = async () => {
    if (activeStudents.length < 2 || shuffling) {
      onNotify('마니또를 배정하려면 최소 2명 이상의 활성 학생이 필요합니다.', 'info');
      return;
    }
    setShuffling(true);
    try {
      await generateFullClassroomAssignments({
        workspaceOwnerUid,
        teacherUid: teacherProfile.uid,
        teacherName: teacherProfile.displayName,
        classId: teacherProfile.classId || '5-2',
        activeStudents,
      });

      onNotify(
        `우리 반 학생 ${activeStudents.length}명 전원의 마니또가 겹치지 않게 순환 재배정되었습니다! 🎉`,
        'success'
      );
    } catch (err) {
      onNotify('마니또 배정 중 오류: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setShuffling(false);
    }
  };

  const handleOpenManualEdit = (giverUid: string) => {
    setModalGiverUid(giverUid);
    const existing = assignments.find((a) => a.giverUid === giverUid);
    setModalReceiverUid(existing?.receiverUid || '');
    setManualModalOpen(true);
  };

  const handleSaveManualAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalGiverUid || !modalReceiverUid) {
      onNotify('마니또 학생과 챙겨줄 친구를 모두 선택해 주세요.', 'error');
      return;
    }
    if (modalGiverUid === modalReceiverUid) {
      onNotify('자기 자신을 마니또 대상으로 지정할 수 없습니다.', 'error');
      return;
    }

    setSavingManual(true);
    try {
      const giverStudent = activeStudents.find((s) => s.uid === modalGiverUid);
      const receiverStudent = activeStudents.find((s) => s.uid === modalReceiverUid);

      const existing = assignments.find((a) => a.giverUid === modalGiverUid);
      const prefix = workspaceOwnerUid.slice(0, 8);
      const randSuffix = Math.random().toString(36).slice(2, 6);
      const nowToken = Date.now().toString(36);
      const assignmentId = `${prefix}_assign_${nowToken}_m_${randSuffix}`;
      const threadId = `${prefix}_thread_${nowToken}_m_${randSuffix}`;
      const scopedClassId = normalizeClassId(workspaceOwnerUid, teacherProfile.classId);
      const startsAt = existing?.startsAt || new Date().toISOString().slice(0, 10);
      const endsAt = existing?.endsAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const batch = writeBatch(db);

      if (existing?.assignmentId) {
        batch.delete(doc(db, 'manittoAssignments', existing.assignmentId));
      }

      batch.set(doc(db, 'manittoAssignments', assignmentId), {
        assignmentId,
        workspaceOwnerUid,
        classId: scopedClassId,
        giverUid: modalGiverUid,
        receiverUid: modalReceiverUid,
        active: true,
        startsAt,
        endsAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'letterThreads', threadId), {
        threadId,
        workspaceOwnerUid,
        classId: scopedClassId,
        assignmentId,
        participantUids: [modalGiverUid, modalReceiverUid],
        lastMessageAt: new Date().toISOString(),
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      try {
        await recordAuditLog({
          workspaceOwnerUid,
          actorUid: teacherProfile.uid,
          actorName: teacherProfile.displayName,
          action: 'MANITTO_MANUAL_ASSIGNED',
          targetType: 'manittoAssignment',
          targetId: assignmentId,
          reason: '교사에 의한 마니또 짝 수동 설정 및 변경',
          metadataSummary: `${giverStudent?.displayName || modalGiverUid} -> ${receiverStudent?.displayName || modalReceiverUid}`,
        });
      } catch (logErr) {
        console.error('Audit log failed:', logErr);
      }

      onNotify(
        `${giverStudent?.displayName} 학생의 마니또 대상이 ${receiverStudent?.displayName}(으)로 수동 설정되었습니다.`,
        'success'
      );
      setManualModalOpen(false);
    } catch (err) {
      onNotify('수동 배정 저장 오류: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setSavingManual(false);
    }
  };

  const handleRemoveAssignment = async (giverUid: string) => {
    const existing = assignments.find((a) => a.giverUid === giverUid);
    if (!existing) return;
    try {
      await deleteDoc(doc(db, 'manittoAssignments', existing.assignmentId));
      onNotify('해당 학생의 마니또 배정이 해제되었습니다.', 'info');
    } catch (err) {
      onNotify('배정 해제 오류: ' + (err instanceof Error ? err.message : String(err)), 'error');
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

  const assignedCount = activeStudents.filter((stu) =>
    assignments.some((a) => a.giverUid === stu.uid && a.receiverUid)
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#6B665E] mb-1">
            전체 학생 {activeStudents.length}명 중 {assignedCount}명 배정 완료 · 자동 순환 및 수동 직접 배정
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
            우리 반 마니또 배정 관리
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleToggleRevealPolicy}
            className="px-4 py-2.5 rounded-xl bg-[#DDD5F8] text-[#141413] text-xs font-bold cursor-pointer hover:bg-[#C9BFF3] transition-colors"
          >
            {appSettings?.identityRevealPolicy === 'revealed'
              ? '현재: 마니또 공개됨 (다시 숨기기)'
              : '현재: 마니또 비밀 유지 중 (정체 공개하기)'}
          </button>
          <button
            type="button"
            onClick={handleShuffleAssignments}
            disabled={shuffling || activeStudents.length < 2}
            className="px-4 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 hover:bg-[#2C2A27] disabled:opacity-50 shadow-xs"
          >
            <Shuffle className={`w-3.5 h-3.5 ${shuffling ? 'animate-spin' : ''}`} />
            <span>{shuffling ? '전체 순환 배정 중...' : '전원 무작위 순환 배정'}</span>
          </button>
        </div>
      </div>

      {/* Roster-Wide Assignment Grid */}
      {activeStudents.length === 0 ? (
        <div className="bg-[#F3EFEA] rounded-[28px] p-8 text-center text-xs text-[#6B665E]">
          등록된 활성 학생이 없습니다. 먼저 [학생 명단/계정] 탭에서 학생을 등록해 주세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeStudents.map((giver) => {
            const currentAssignment = assignments.find((a) => a.giverUid === giver.uid);
            const receiver = currentAssignment
              ? allUsers.find((u) => u.uid === currentAssignment.receiverUid)
              : null;

            return (
              <div
                key={giver.uid}
                className="bg-[#F3EFEA] rounded-[24px] p-5 flex flex-col justify-between gap-3 shadow-xs border border-[#E8E4DC]/60"
              >
                <div className="flex items-center justify-between gap-2">
                  {/* Giver Student */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AvatarIllustration avatarId={giver.avatarId || 'rabbit'} size="sm" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-[#6B665E] block truncate">
                        마니또 (챙겨주는 친구)
                      </span>
                      <p className="text-sm font-extrabold text-[#141413] truncate">
                        {giver.displayName}
                      </p>
                      <p className="text-[10px] text-[#8C827A] font-mono">
                        {giver.studentLoginId}
                      </p>
                    </div>
                  </div>

                  <span className="text-base font-extrabold text-[#8C827A] shrink-0 px-1">→</span>

                  {/* Receiver Student */}
                  <div className="flex items-center gap-2.5 text-right min-w-0">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-emerald-700 block truncate">
                        챙김받을 대상
                      </span>
                      {receiver ? (
                        <>
                          <p className="text-sm font-extrabold text-emerald-900 truncate">
                            {receiver.displayName}
                          </p>
                          <p className="text-[10px] text-emerald-700 font-mono">
                            {receiver.studentLoginId}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs font-bold text-rose-600">⚠️ 미배정</p>
                      )}
                    </div>
                    {receiver ? (
                      <AvatarIllustration avatarId={receiver.avatarId || 'cat'} size="sm" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xs font-extrabold shrink-0">
                        ?
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Action Bar for Manual Assignment */}
                <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-[#E2DDD3]/60">
                  {receiver && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAssignment(giver.uid)}
                      className="px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 rounded-lg cursor-pointer"
                    >
                      배정 해제
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenManualEdit(giver.uid)}
                    className="px-3 py-1.5 rounded-xl bg-white text-[#141413] text-xs font-bold hover:bg-[#141413] hover:text-white cursor-pointer shadow-xs transition-colors"
                  >
                    ✍️ 대상 직접 변경
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Assignment Modal */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FBF9F5] rounded-[32px] max-w-md w-full p-6 space-y-4 shadow-xl border border-white">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2DDD3]">
              <h3 className="text-lg font-extrabold text-[#141413]">
                마니또 짝 수동 설정
              </h3>
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#EFECE6] flex items-center justify-center text-sm font-bold cursor-pointer hover:bg-[#E2DDD3]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveManualAssignment} className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-[#141413] mb-1.5">
                  1. 마니또 (챙겨주는 학생)
                </label>
                <select
                  value={modalGiverUid}
                  onChange={(e) => setModalGiverUid(e.target.value)}
                  required
                  className="w-full rounded-xl bg-white px-3.5 py-2.5 text-xs font-bold text-[#141413] border border-[#E2DDD3]"
                >
                  <option value="">학생을 선택하세요</option>
                  {activeStudents.map((s) => (
                    <option key={s.uid} value={s.uid}>
                      {s.displayName} ({s.studentLoginId})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-[#141413] mb-1.5">
                  2. 챙김받을 친구 (대상 학생)
                </label>
                <select
                  value={modalReceiverUid}
                  onChange={(e) => setModalReceiverUid(e.target.value)}
                  required
                  className="w-full rounded-xl bg-white px-3.5 py-2.5 text-xs font-bold text-[#141413] border border-[#E2DDD3]"
                >
                  <option value="">대상 친구를 선택하세요</option>
                  {activeStudents
                    .filter((s) => s.uid !== modalGiverUid)
                    .map((s) => (
                      <option key={s.uid} value={s.uid}>
                        {s.displayName} ({s.studentLoginId})
                      </option>
                    ))}
                </select>
              </div>

              <div className="bg-[#DDD5F8]/40 rounded-2xl p-3 text-xs text-[#3730A3]">
                💡 교사가 직접 짝을 지정하면, 해당 학생의 마니또 미션과 비밀 편지 대상이 즉시 변경됩니다.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#EFECE6] text-xs font-bold text-[#4A463F] cursor-pointer hover:bg-[#E2DDD3]"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={savingManual}
                  className="px-5 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-extrabold cursor-pointer hover:bg-[#2C2A27] shadow-xs"
                >
                  {savingManual ? '저장 중...' : '배정 저장하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
  const sessionId = loungeSession?.sessionId || 'session_shindong_5_2';
  const currentStatus = loungeSession?.status || 'active';

  const [title, setTitle] = useState(
    loungeSession?.title || '5학년 2반 따뜻한 칭찬 라운지'
  );
  const [scheduledDate, setScheduledDate] = useState(
    loungeSession?.scheduledDate || new Date().toISOString().slice(0, 10)
  );
  const [startsAt, setStartsAt] = useState(loungeSession?.startsAt || '08:30');
  const [endsAt, setEndsAt] = useState(loungeSession?.endsAt || '16:30');
  const [noticeRules, setNoticeRules] = useState(
    loungeSession?.noticeRules || '친구의 장점을 칭찬하고 서로를 응원하는 고운 말을 사용해요.'
  );

  // Teacher Real Name Visibility Toggle
  const [showRealNames, setShowRealNames] = useState(true);
  const [batchDeletingMsgs, setBatchDeletingMsgs] = useState(false);

  // Compute live logged-in students currently viewing/connected to the lounge (active in last 3 mins)
  const liveLoungeViewers = useMemo(() => {
    const now = Date.now();
    return loungeParticipants.filter((p) => {
      if (p.presenceStatus === 'left') return false;
      if (!p.lastHeartbeatAt) return false;
      const diffMs = now - new Date(p.lastHeartbeatAt).getTime();
      return diffMs <= 3 * 60 * 1000;
    });
  }, [loungeParticipants]);

  // Initialize or Open lounge session if none exists
  const handleInitLoungeSession = async () => {
    try {
      await setDoc(doc(db, 'loungeSessions', sessionId), {
        sessionId,
        workspaceOwnerUid,
        classId: teacherProfile.classId || '5-2',
        title: title || '5학년 2반 따뜻한 칭찬 라운지',
        scheduledDate,
        startsAt,
        endsAt,
        status: 'active',
        waitingCount: 0,
        participantCount: 0,
        createdBy: teacherProfile.uid,
        noticeRules: noticeRules || '친구의 장점을 칭찬하고 서로를 응원하는 고운 말을 사용해요.',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onNotify('익명 학급 라운지가 즉시 개설되고 [자유 대화 진행 중] 상태로 전환되었습니다!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'loungeSessions');
    }
  };

  const handleUpdateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, 'loungeSessions', sessionId), {
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
      await updateDoc(doc(db, 'loungeSessions', sessionId), {
        status,
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        workspaceOwnerUid,
        actorUid: teacherProfile.uid,
        actorName: teacherProfile.displayName,
        action: `LOUNGE_STATUS_${status.toUpperCase()}`,
        targetType: 'loungeSession',
        targetId: sessionId,
        reason: '교사에 의한 익명 라운지 운영 상태 변경',
        metadataSummary: `status -> ${status}`,
      });
      onNotify(
        status === 'active'
          ? '라운지가 자유 대화 작성 모드로 전환되었습니다.'
          : '라운지가 읽기 전용 종료 상태로 전환되었습니다.',
        'success'
      );
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

  // Delete Individual Message Permanently
  const handleDeleteSingleMessage = async (msg: LoungeMessage) => {
    if (!confirm(`[${msg.anonymousAlias}] 학생이 작성한 이 대화 메시지를 완전히 삭제하시겠습니까?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'loungeMessages', msg.messageId));
      await recordAuditLog({
        workspaceOwnerUid,
        actorUid: teacherProfile.uid,
        actorName: teacherProfile.displayName,
        action: 'LOUNGE_MSG_DELETED',
        targetType: 'loungeMessage',
        targetId: msg.messageId,
        reason: '교사에 의한 부적절/테스트 대화 개별 메시지 삭제',
        metadataSummary: `[${msg.anonymousAlias}] ${msg.body.slice(0, 30)}`,
      });
      onNotify('메시지가 성공적으로 삭제되었습니다.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'loungeMessages');
    }
  };

  // Batch Delete All Lounge Messages
  const handleBatchDeleteAllMessages = async () => {
    if (loungeMessages.length === 0) {
      onNotify('삭제할 라운지 대화 내용이 없습니다.', 'info');
      return;
    }
    if (
      !confirm(
        `현재 라운지에 작성된 대화 메시지 전체(${loungeMessages.length}건)를 일괄 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`
      )
    ) {
      return;
    }

    setBatchDeletingMsgs(true);
    try {
      const batch = writeBatch(db);
      for (const msg of loungeMessages) {
        batch.delete(doc(db, 'loungeMessages', msg.messageId));
      }
      await batch.commit();

      await recordAuditLog({
        workspaceOwnerUid,
        actorUid: teacherProfile.uid,
        actorName: teacherProfile.displayName,
        action: 'LOUNGE_ALL_MSGS_BATCH_DELETED',
        targetType: 'loungeSession',
        targetId: sessionId,
        reason: '교사에 의한 라운지 대화 기록 전체 일괄 초기화 삭제',
        metadataSummary: `총 ${loungeMessages.length}건 대화 일괄 영구 삭제 완료`,
      });
      onNotify(`라운지 대화 ${loungeMessages.length}건이 모두 일괄 삭제되었습니다.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'loungeMessages');
    } finally {
      setBatchDeletingMsgs(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#6B665E] mb-1">
            라운지 운영 시간 및 자유 대화 관리 · 실시간 열람 인원 확인 · 실명 표시 ON/OFF
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
            익명 학급 라운지 운영 및 대화 기록 관리
          </h1>
        </div>

        {/* Real-Name ON/OFF Toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRealNames(!showRealNames)}
            className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold cursor-pointer flex items-center gap-2 transition-all shadow-xs ${
              showRealNames
                ? 'bg-[#141413] text-white hover:bg-[#2C2A27]'
                : 'bg-[#DDD5F8] text-[#3730A3] hover:bg-[#C9BFF3]'
            }`}
            title="교사 화면에서 학생들의 실명을 표시하거나 숨길 수 있습니다"
          >
            {showRealNames ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span>학생 실명 확인: {showRealNames ? 'ON (실명 표시 중)' : 'OFF (익명 별명만 표시)'}</span>
          </button>
        </div>
      </div>

      {/* If Lounge Session was missing or not created yet */}
      {!loungeSession && (
        <div className="bg-[#FEF3C7] border border-amber-300 rounded-[24px] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
            <div>
              <p className="text-xs font-extrabold text-amber-900">
                아직 생성된 라운지 세션 문서가 없습니다.
              </p>
              <p className="text-[11px] text-amber-800">
                아래 버튼을 누르면 라운지가 즉시 개설되어 학생들이 입장할 수 있습니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInitLoungeSession}
            className="px-4 py-2 rounded-xl bg-amber-700 text-white text-xs font-extrabold hover:bg-amber-800 cursor-pointer shrink-0 shadow-xs"
          >
            ✨ 라운지 운영 즉시 시작하기
          </button>
        </div>
      )}

      {/* Status Control Buttons */}
      <div className="bg-[#DDD5F8] rounded-[28px] p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-[#3730A3]">라운지 진행 상태 제어</span>
          <h2 className="text-lg font-extrabold text-[#141413] mt-0.5">
            현재 상태: {currentStatus === 'active' ? '🟢 자유 대화 진행 중' : '🔴 라운지 종료/점검 중'}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'active', label: '🟢 자유 대화 열기' },
              { id: 'ended', label: '🔴 라운지 종료 / 읽기 전용' },
            ] as const
          ).map((btn) => (
            <button
              key={btn.id}
              onClick={() => handleSetStatus(btn.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${
                currentStatus === btn.id
                  ? 'bg-[#141413] text-white shadow-xs'
                  : 'bg-white text-[#141413] hover:bg-white/80'
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
        <h3 className="text-base font-extrabold text-[#141413]">라운지 일정 및 공지 규칙 설정</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="라운지 제목"
            className="rounded-xl bg-white px-3.5 py-2 text-xs md:col-span-2 font-bold"
          />
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="rounded-xl bg-white px-3.5 py-2 text-xs font-bold"
          />
          <div className="flex items-center gap-1.5">
            <input
              type="time"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="rounded-xl bg-white px-2.5 py-2 text-xs w-full font-bold"
            />
            <span>~</span>
            <input
              type="time"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="rounded-xl bg-white px-2.5 py-2 text-xs w-full font-bold"
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={noticeRules}
            onChange={(e) => setNoticeRules(e.target.value)}
            placeholder="대화 규칙 공지 문구"
            className="flex-1 rounded-xl bg-white px-3.5 py-2 text-xs font-bold"
          />
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-[#141413] text-white text-xs font-bold cursor-pointer hover:bg-[#2C2A27]"
          >
            일정 및 공지 저장
          </button>
        </div>
      </form>

      {/* Active Viewers List */}
      <div className="bg-[#E0F2FE] rounded-[28px] p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <h3 className="text-base font-extrabold text-[#0369A1]">
              👀 현재 라운지 실시간 접속 및 열람 학생 ({liveLoungeViewers.length}명)
            </h3>
          </div>
          <span className="text-xs text-[#0284C7] font-bold">
            {showRealNames ? '실명 매핑 ON (교사 전용)' : '익명 별명 모드'}
          </span>
        </div>

        {liveLoungeViewers.length === 0 ? (
          <p className="text-xs text-[#0284C7]">현재 접속하여 라운지를 열람 중인 학생이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {liveLoungeViewers.map((p) => {
              const realStu = allUsers.find((u) => u.uid === p.participantUid);
              return (
                <div
                  key={p.participantUid}
                  className="bg-white px-3.5 py-2 rounded-xl border border-[#BAE6FD] flex items-center gap-2 text-xs font-bold shadow-xs"
                >
                  <span className="text-[#141413]">[{p.anonymousAlias}]</span>
                  {showRealNames && (
                    <span className="text-indigo-800 font-extrabold bg-indigo-50 px-2 py-0.5 rounded-md">
                      실명: {realStu ? `${realStu.displayName} (${realStu.studentLoginId})` : '학생'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Teacher Message Moderation & Delete Log */}
      <div className="bg-[#F3EFEA] rounded-[28px] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#E2DDD3]">
          <div>
            <h3 className="text-base font-extrabold text-[#141413]">
              라운지 전체 대화 기록 관리 (총 {loungeMessages.length}건)
            </h3>
            <p className="text-xs text-[#6B665E]">
              부적절한 대화는 숨김 처리하거나 영구 삭제할 수 있으며, 전체 대화를 일괄 초기화할 수 있습니다.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={batchDeletingMsgs || loungeMessages.length === 0}
              onClick={handleBatchDeleteAllMessages}
              className="px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-extrabold hover:bg-rose-700 cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{batchDeletingMsgs ? '삭제 중...' : '대화 내용 전체 일괄 삭제'}</span>
            </button>
          </div>
        </div>

        {loungeMessages.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-xs text-[#6B665E]">
            아직 작성된 라운지 대화 메시지가 없습니다.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            {loungeMessages.map((msg) => {
              const realStu = allUsers.find((u) => u.uid === msg.senderUid);
              return (
                <div
                  key={msg.messageId}
                  className={`rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border ${
                    msg.moderationStatus === 'hidden'
                      ? 'bg-rose-50 border-rose-200 opacity-70'
                      : 'bg-white border-[#E8E4DC]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-[#141413]">
                        [{msg.anonymousAlias}]
                      </span>

                      {/* Real Student Name Display (Toggled by Teacher) */}
                      {showRealNames && (
                        <span className="px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-900 font-extrabold text-[11px]">
                          실명: {realStu ? `${realStu.displayName} (${realStu.studentLoginId})` : '등록 학생 없음'}
                        </span>
                      )}

                      <span className="text-[10px] text-[#8C827A] tabular-nums">
                        {typeof msg.createdAt === 'string'
                          ? new Date(msg.createdAt).toLocaleTimeString('ko-KR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>

                      {msg.moderationStatus === 'hidden' && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-200 text-rose-800 text-[10px] font-bold">
                          숨김 상태
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[#3D3A35] leading-relaxed break-words">
                      {msg.body}
                    </p>
                  </div>

                  {/* Moderation Action Buttons: Toggle Hide & Delete Single Message */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleToggleHideMessage(msg)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                        msg.moderationStatus === 'hidden'
                          ? 'bg-[#141413] text-white hover:bg-[#2C2A27]'
                          : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                      }`}
                    >
                      {msg.moderationStatus === 'hidden' ? '숨김 해제' : '숨기기'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSingleMessage(msg)}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-100 text-rose-700 text-xs font-bold hover:bg-rose-200 cursor-pointer flex items-center gap-1"
                      title="이 메시지를 완전히 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>삭제</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * 8. TEACHER CLASSROOM ANALYTICS & STATS VIEW
 * ========================================================================== */
const TeacherStatsView: React.FC<TeacherContextProps> = ({
  currentClass,
  allUsers,
  missions,
  submissions,
  stats,
  badges,
  badgeAwards,
}) => {
  const [sortBy, setSortBy] = useState<'id' | 'points' | 'missions'>('id');

  const students = useMemo(() => {
    return allUsers
      .filter((u) => u.role === 'student')
      .sort((a, b) => a.studentLoginId.localeCompare(b.studentLoginId));
  }, [allUsers]);

  const studentChartData = useMemo(() => {
    const data = students.map((stu) => {
      const st = stats.find((x) => x.studentUid === stu.uid);
      const studentSubs = submissions.filter(
        (s) => s.studentUid === stu.uid && s.status === 'approved'
      );
      const calculatedPoints =
        st?.totalPoints ??
        studentSubs.reduce((acc, cur) => acc + (cur.awardedPoints || 0), 0);
      const calculatedMissions = st?.completedMissionCount ?? studentSubs.length;
      const studentBadgesCount = badgeAwards.filter((a) => a.studentUid === stu.uid).length;

      return {
        uid: stu.uid,
        name: stu.displayName,
        loginId: stu.studentLoginId,
        avatarId: stu.avatarId,
        점수: calculatedPoints,
        완료미션수: calculatedMissions,
        획득뱃지수: studentBadgesCount,
        status: stu.accountStatus,
      };
    });

    if (sortBy === 'points') {
      return [...data].sort((a, b) => b.점수 - a.점수);
    }
    if (sortBy === 'missions') {
      return [...data].sort((a, b) => b.완료미션수 - a.완료미션수);
    }
    return data;
  }, [students, stats, submissions, badgeAwards, sortBy]);

  const badgeDistribution = useMemo(() => {
    return badges.map((b) => ({
      name: b.name,
      획득학생수: badgeAwards.filter((a) => a.badgeId === b.badgeId).length,
    }));
  }, [badges, badgeAwards]);

  const chartMinWidth = Math.max(520, studentChartData.length * 52);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#6B665E] mb-1">
            {currentClass?.schoolName || '전주신동초등학교'} {currentClass?.name || '5학년 2반'} 학급 친절 활동 및 성장 통계
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
              우리 반 마니또 친절 성장 통계
            </h1>
            <span className="px-3 py-1 rounded-full bg-[#C6F0DF] text-[#065F46] text-xs font-extrabold">
              전체 학생 {students.length}명 전원 집계
            </span>
          </div>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-1.5 bg-[#F3EFEA] p-1.5 rounded-2xl border border-[#E2DDD3]">
          <span className="text-[11px] font-bold text-[#6B665E] px-2">정렬 기준:</span>
          <button
            type="button"
            onClick={() => setSortBy('id')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              sortBy === 'id'
                ? 'bg-[#141413] text-white shadow-xs'
                : 'text-[#4A463F] hover:bg-white'
            }`}
          >
            기본 번호순
          </button>
          <button
            type="button"
            onClick={() => setSortBy('points')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              sortBy === 'points'
                ? 'bg-[#141413] text-white shadow-xs'
                : 'text-[#4A463F] hover:bg-white'
            }`}
          >
            점수 높은 순
          </button>
          <button
            type="button"
            onClick={() => setSortBy('missions')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              sortBy === 'missions'
                ? 'bg-[#141413] text-white shadow-xs'
                : 'text-[#4A463F] hover:bg-white'
            }`}
          >
            미션 많은 순
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Main Chart: Student Scores & Completed Missions */}
        <div className="bg-[#F3EFEA] rounded-[28px] p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-[#141413]">
                학생별 누적 친절 점수 및 완료 미션 현황 (전원 표시)
              </h2>
              <p className="text-xs text-[#6B665E] mt-0.5">
                학생 수가 많을 경우 좌우로 부드럽게 스크롤하여 전체 학생을 확인할 수 있습니다.
              </p>
            </div>
            <span className="text-xs font-bold text-[#065F46] bg-white px-2.5 py-1 rounded-xl shadow-xs">
              {studentChartData.length}명
            </span>
          </div>

          <div className="bg-white rounded-2xl p-4 overflow-x-auto">
            <div style={{ minWidth: `${chartMinWidth}px`, height: '320px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={studentChartData}
                  margin={{ top: 20, right: 20, left: 0, bottom: 25 }}
                  barCategoryGap="20%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#EFECE6" />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    angle={studentChartData.length > 6 ? -35 : 0}
                    textAnchor={studentChartData.length > 6 ? 'end' : 'middle'}
                    height={studentChartData.length > 6 ? 55 : 30}
                    tick={{ fontSize: 11, fill: '#141413', fontWeight: 600 }}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-[#141413] text-white p-3 rounded-xl shadow-xl text-xs space-y-1">
                            <p className="font-extrabold text-sm">{d.name} ({d.loginId})</p>
                            <p className="text-emerald-400 font-bold">✨ 누적 점수: {d.점수}점</p>
                            <p className="text-indigo-300">🎯 완료 미션: {d.완료미션수}회</p>
                            <p className="text-amber-300">🏅 획득 뱃지: {d.획득뱃지수}개</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />
                  <Bar dataKey="점수" fill="#10B981" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="완료미션수" fill="#818CF8" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Badges Distribution Chart */}
        <div className="bg-[#F3EFEA] rounded-[28px] p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-[#141413]">
                마니또 뱃지 5종 학급 획득 현황
              </h2>
              <p className="text-xs text-[#6B665E] mt-0.5">
                친절 새싹 · 소통 우체부 · 장점 관찰자 · 든든한 돌보미 · 마니또 스타
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={badgeDistribution}
                margin={{ top: 20, right: 20, left: 0, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#EFECE6" />
                <XAxis
                  dataKey="name"
                  interval={0}
                  tick={{ fontSize: 11, fill: '#141413', fontWeight: 600 }}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />
                <Bar dataKey="획득학생수" fill="#F59E0B" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Complete Student Roster Table for Easy Reference */}
      <div className="bg-[#F3EFEA] rounded-[28px] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-[#141413]">
              📋 전체 학생 친절 통계 상세 목록 ({studentChartData.length}명)
            </h2>
            <p className="text-xs text-[#6B665E] mt-0.5">
              학급 전체 학생들의 세부 점수와 활동 달성률을 한눈에 확인합니다.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl overflow-x-auto border border-[#E2DDD3]">
          <table className="w-full text-left border-collapse min-w-[650px]">
            <thead>
              <tr className="border-b border-[#EFECE6] text-xs text-[#6B665E]">
                <th className="py-3 px-4 text-center w-12">순번</th>
                <th className="py-3 px-4">학생 이름 / 아이디</th>
                <th className="py-3 px-4 text-center">계정 상태</th>
                <th className="py-3 px-4 text-right">누적 점수</th>
                <th className="py-3 px-4 text-right">완료 미션 수</th>
                <th className="py-3 px-4 text-right">획득 뱃지 수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFECE6] text-xs">
              {studentChartData.map((stu, index) => (
                <tr key={stu.uid} className="hover:bg-[#FAF9F6]">
                  <td className="py-3 px-4 text-center text-[#8C827A] font-bold">
                    {index + 1}
                  </td>
                  <td className="py-3 px-4 font-bold text-[#141413]">
                    <div className="flex items-center gap-2">
                      <span>{stu.name}</span>
                      <span className="font-mono text-[11px] text-[#6B665E] font-normal">
                        ({stu.loginId})
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold ${
                        stu.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {stu.status === 'active' ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-extrabold text-[#141413] tabular-nums">
                    {stu.점수}점
                  </td>
                  <td className="py-3 px-4 text-right text-[#3D3A35] font-semibold tabular-nums">
                    {stu.완료미션수}회
                  </td>
                  <td className="py-3 px-4 text-right text-amber-700 font-extrabold tabular-nums">
                    {stu.획득뱃지수}개
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  currentClass,
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

  const [deletingLogs, setDeletingLogs] = useState(false);

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

  // Teacher Profile State
  // Teacher Profile & Classroom Info State
  const [profileDisplayName, setProfileDisplayName] = useState(teacherProfile.displayName);
  const [profileAvatarId, setProfileAvatarId] = useState(teacherProfile.avatarId || 'teacher');
  const [profileBio, setProfileBio] = useState(teacherProfile.bio || '');
  const [settingsSchoolName, setSettingsSchoolName] = useState(
    currentClass?.schoolName || '전주신동초등학교'
  );
  const [settingsClassName, setSettingsClassName] = useState(
    currentClass?.name || '5학년 2반'
  );
  const [savingProfile, setSavingProfile] = useState(false);

  // Sync state whenever currentClass or teacherProfile updates
  React.useEffect(() => {
    if (currentClass) {
      setSettingsSchoolName(currentClass.schoolName || '전주신동초등학교');
      setSettingsClassName(currentClass.name || '5학년 2반');
    }
  }, [currentClass]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileDisplayName.trim()) {
      onNotify('선생님 성함을 입력해 주세요.', 'error');
      return;
    }
    if (!settingsClassName.trim()) {
      onNotify('학급 이름을 입력해 주세요.', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      await updateTeacherProfile({
        workspaceOwnerUid,
        teacherUid: teacherProfile.uid,
        displayName: profileDisplayName.trim(),
        avatarId: profileAvatarId,
        bio: profileBio.trim(),
        classId: normalizeClassId(workspaceOwnerUid, currentClass?.classId || teacherProfile.classId),
        className: settingsClassName.trim(),
        schoolName: settingsSchoolName.trim() || '전주신동초등학교',
      });
      onNotify('교사 성함과 학급 정보(학교명, 학급 이름)가 성공적으로 저장되었습니다!', 'success');
    } catch (err) {
      onNotify('프로필 변경 오류: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#6B665E] mb-1">
          교사 관리자 비밀번호 변경 · 교사 프로필/이름 수정 · 학급 이름 및 학교명 설정 · 감사 로그
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
          교사 보안 설정 및 감사 로그
        </h1>
      </div>

      {/* Teacher Profile & Classroom Info Edit Form */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-[#DDD5F8]/50 rounded-[28px] p-6 space-y-4 border border-[#C9BFF3]"
      >
        <div>
          <h2 className="text-base font-extrabold text-[#141413]">
            👨‍🏫 교사 프로필 및 학급 정보 수정
          </h2>
          <p className="text-xs text-[#3D3A35] mt-0.5">
            선생님의 성함, 학교명, 학급 이름(반 명칭), 캐릭터 아바타, 소개 문구를 변경합니다. 변경 즉시 화면 상단과 로그인 명단에 반영됩니다.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1">
              선생님 성함 / 표시 이름
            </label>
            <input
              type="text"
              value={profileDisplayName}
              onChange={(e) => setProfileDisplayName(e.target.value)}
              required
              className="w-full rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-[#141413]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1">
              학교명
            </label>
            <input
              type="text"
              value={settingsSchoolName}
              onChange={(e) => setSettingsSchoolName(e.target.value)}
              placeholder="예: 전주신동초등학교"
              required
              className="w-full rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-[#141413]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1">
              학급 명칭 (반 이름)
            </label>
            <input
              type="text"
              value={settingsClassName}
              onChange={(e) => setSettingsClassName(e.target.value)}
              placeholder="예: 5학년 2반"
              required
              className="w-full rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-[#141413]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#141413] mb-1">
            선생님 캐릭터 아바타
          </label>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-32 overflow-y-auto p-1.5 bg-white rounded-2xl border border-[#E2DDD3]">
            {AVATAR_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setProfileAvatarId(opt.id)}
                className={`p-2 rounded-xl flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  profileAvatarId === opt.id
                    ? 'bg-[#141413] text-white ring-2 ring-[#141413]'
                    : 'hover:bg-[#F3EFEA] text-[#141413]'
                }`}
              >
                <AvatarIllustration avatarId={opt.id} size="sm" />
                <span className="text-[10px] font-bold truncate max-w-full">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#141413] mb-1">
            학급 인사말 및 소개 문구
          </label>
          <textarea
            rows={2}
            value={profileBio}
            onChange={(e) => setProfileBio(e.target.value)}
            className="w-full rounded-xl bg-white p-3 text-xs text-[#141413]"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingProfile}
            className="px-5 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-extrabold cursor-pointer hover:bg-[#2C2A27] shadow-xs"
          >
            {savingProfile ? '저장 중...' : '교사 프로필 및 학급 정보 저장'}
          </button>
        </div>
      </form>

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
      <div className="bg-[#F3EFEA] rounded-[28px] p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-[#141413]">
              보안 감사 로그 (Audit Logs)
            </h2>
            <p className="text-xs text-[#6B665E] mt-0.5">
              학급 운영 및 관리자 활동 기록입니다. 필요 시 개별 로그를 삭제하거나 전체 비울 수 있습니다.
            </p>
          </div>
          {auditLogs.length > 0 && (
            <button
              type="button"
              disabled={deletingLogs}
              onClick={async () => {
                if (window.confirm('모든 감사 로그 기록을 서버에서 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
                  setDeletingLogs(true);
                  try {
                    const count = await deleteAllAuditLogs(workspaceOwnerUid);
                    onNotify(`총 ${count}건의 감사 로그가 서버에서 완전히 삭제되었습니다.`, 'success');
                  } catch (err) {
                    onNotify('감사 로그 전체 삭제 중 오류 발생: ' + (err instanceof Error ? err.message : String(err)), 'error');
                  } finally {
                    setDeletingLogs(false);
                  }
                }
              }}
              className="px-3.5 py-1.5 rounded-xl bg-rose-100 text-rose-800 text-xs font-bold hover:bg-rose-200 cursor-pointer transition-colors disabled:opacity-50"
            >
              {deletingLogs ? '서버 삭제 진행 중...' : '🗑️ 전체 로그 삭제'}
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl overflow-x-auto">
          {auditLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#6B665E]">
              기록된 감사 로그가 없습니다.
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-[#EFECE6] text-xs text-[#6B665E]">
                  <th className="py-3 px-4">작업자</th>
                  <th className="py-3 px-4">작업 유형</th>
                  <th className="py-3 px-4">사유</th>
                  <th className="py-3 px-4">상세 내역</th>
                  <th className="py-3 px-4 text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE6] text-xs">
                {auditLogs.map((log) => (
                  <tr key={log.logId} className="hover:bg-[#FAF9F6]">
                    <td className="py-3 px-4 font-bold text-[#141413]">{log.actorName}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-indigo-700">
                      {log.action}
                    </td>
                    <td className="py-3 px-4 text-[#3D3A35]">{log.reason}</td>
                    <td className="py-3 px-4 text-[#6B665E]">{log.metadataSummary}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm(`[${log.action}] 로그를 삭제하시겠습니까?`)) {
                            try {
                              await deleteAuditLog(log.logId);
                              onNotify('감사 로그가 삭제되었습니다.', 'success');
                            } catch (err) {
                              onNotify('로그 삭제 실패', 'error');
                            }
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-[11px] font-bold hover:bg-rose-100 cursor-pointer"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
