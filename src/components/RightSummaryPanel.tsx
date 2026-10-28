import React, { useMemo } from 'react';
import {
  Bell,
  Settings,
  ChevronRight,
  Mail,
  MessageSquareHeart,
  Award,
  Sparkles,
} from 'lucide-react';
import {
  UserProfile,
  Mission,
  MissionSubmission,
  StudentStats,
  Badge,
  BadgeAward,
  Letter,
  LoungeSession,
  LoungeParticipant,
  StudentNavTab,
  TeacherNavTab,
} from '../types/manitto';
import { AvatarIllustration } from './AvatarIllustration';
import { getBadgeProgress } from '../services/manittoServerEngine';

interface RightSummaryPanelProps {
  activeUser: UserProfile;
  allUsers: UserProfile[];
  missions: Mission[];
  submissions: MissionSubmission[];
  stats: StudentStats[];
  badges: Badge[];
  badgeAwards: BadgeAward[];
  letters: Letter[];
  loungeSession: LoungeSession | null;
  loungeParticipants: LoungeParticipant[];
  onStudentNavigate: (tab: StudentNavTab) => void;
  onTeacherNavigate: (tab: TeacherNavTab) => void;
}

export const RightSummaryPanel: React.FC<RightSummaryPanelProps> = ({
  activeUser,
  allUsers,
  missions,
  submissions,
  stats,
  badges,
  badgeAwards,
  letters,
  loungeSession,
  loungeParticipants,
  onStudentNavigate,
  onTeacherNavigate,
}) => {
  const isTeacher = activeUser.role === 'teacher';
  const activeStudents = useMemo(
    () => allUsers.filter((u) => u.role === 'student' && u.accountStatus === 'active'),
    [allUsers]
  );

  const myStat = stats.find((s) => s.studentUid === activeUser.uid);
  const myPoints = myStat?.totalPoints ?? 0;

  const classAvgPoints = useMemo(() => {
    if (activeStudents.length === 0) return 0;
    const sum = activeStudents.reduce((acc, stu) => {
      const st = stats.find((x) => x.studentUid === stu.uid);
      return acc + (st?.totalPoints ?? 0);
    }, 0);
    return Math.round(sum / activeStudents.length);
  }, [activeStudents, stats]);

  const unreadLettersCount = useMemo(
    () =>
      letters.filter(
        (l) =>
          l.receiverUid === activeUser.uid &&
          !l.readAt &&
          l.moderationStatus !== 'hidden' &&
          !l.deletedAt
      ).length,
    [letters, activeUser.uid]
  );

  const sentLettersCount = useMemo(
    () => letters.filter((l) => l.senderUid === activeUser.uid).length,
    [letters, activeUser.uid]
  );

  const badgeProgressList = useMemo(() => {
    return badges.map((b) => ({
      badge: b,
      progress: getBadgeProgress({
        badge: b,
        studentUid: activeUser.uid,
        missions,
        submissions,
        sentLettersCount,
        existingAwards: badgeAwards,
      }),
    }));
  }, [badges, activeUser.uid, missions, submissions, sentLettersCount, badgeAwards]);

  const waitingCount = loungeParticipants.filter((p) => p.presenceStatus === 'waiting').length;
  const activeCount = loungeParticipants.filter((p) => p.presenceStatus === 'active').length;

  // Stacked pastel columns for the Activity card (matching reference image visual)
  const stackedColumns = [
    { label: '월', h1: 18, h2: 14, h3: 16, active: false },
    { label: '화', h1: 22, h2: 18, h3: 14, active: false },
    { label: '수', h1: 16, h2: 20, h3: 22, active: false },
    { label: '목', h1: 26, h2: 16, h3: 20, active: false },
    { label: '금', h1: 18, h2: 14, h3: 18, active: false },
    { label: '오늘', h1: 28, h2: 22, h3: 24, active: true },
  ];

  const loungeStatusText =
    loungeSession?.status === 'active'
      ? '라운지 진행 중'
      : loungeSession?.status === 'waiting'
      ? '대기실 열림'
      : loungeSession?.status === 'scheduled'
      ? '운영 예정'
      : '종료됨';

  return (
    <aside className="bg-[#F3EFEA] rounded-[32px] p-6 flex flex-col gap-5 w-full">
      {/* Top Icons Row (Bell -> Letters/Reports, Gear -> Settings) */}
      <div className="flex items-center justify-between">
        <button
          onClick={() =>
            isTeacher ? onTeacherNavigate('reports') : onStudentNavigate('letters')
          }
          title={isTeacher ? '안전 신고 확인' : '익명 편지함 알림'}
          className="w-10 h-10 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-[#141413] relative cursor-pointer transition-colors"
        >
          <Bell className="w-4 h-4" />
          {unreadLettersCount > 0 && !isTeacher && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
              {unreadLettersCount}
            </span>
          )}
        </button>

        <button
          onClick={() =>
            isTeacher ? onTeacherNavigate('settings') : onStudentNavigate('settings')
          }
          title="설정 및 안전 약속"
          className="w-10 h-10 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-[#141413] cursor-pointer transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Profile Summary */}
      <div className="flex flex-col items-center text-center">
        <AvatarIllustration avatarId={activeUser.avatarId} size="xl" className="mb-3" />
        <h2 className="text-lg font-extrabold text-[#141413]">{activeUser.displayName}</h2>
        <p className="text-xs text-[#6B665E] mt-0.5">
          {isTeacher
            ? '전주신동초 5학년 2반 담임교사'
            : `5학년 2반 · 아이디: ${activeUser.studentLoginId}`}
        </p>
      </div>

      {/* Unread Letters & Classmates Strip (Matches "274 Friends" strip in reference image) */}
      <button
        onClick={() =>
          isTeacher ? onTeacherNavigate('assignments') : onStudentNavigate('letters')
        }
        className="bg-white rounded-2xl px-4 py-3.5 flex items-center justify-between gap-2 hover:bg-[#FAF8F5] transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#F3EFEA] flex items-center justify-center text-[#141413]">
            <Mail className="w-4 h-4" />
          </div>
          <div>
            <span className="block text-xs font-extrabold text-[#141413] tabular-nums">
              {isTeacher
                ? `우리 반 학생 ${activeStudents.length}명 마니또`
                : `읽지 않은 편지 ${unreadLettersCount}통`}
            </span>
            <span className="block text-[11px] text-[#6B665E]">
              {isTeacher ? '마니또 순환 배정 관리' : '익명 편지함 바로가기'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center -space-x-2">
            {activeStudents.slice(0, 3).map((stu) => (
              <AvatarIllustration
                key={stu.uid}
                avatarId={stu.avatarId}
                size="sm"
                className="ring-2 ring-white"
              />
            ))}
          </div>
          <ChevronRight className="w-4 h-4 text-[#6B665E]" />
        </div>
      </button>

      {/* Activity & Score Comparison Card (Matches "Activity 3.5h Great result!" stacked bar card) */}
      <div className="bg-white rounded-[24px] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#141413]">
            {isTeacher ? '학급 평균 점수' : '나의 친절 점수'}
          </span>
          <button
            onClick={() =>
              isTeacher ? onTeacherNavigate('stats') : onStudentNavigate('growth')
            }
            className="px-2.5 py-1 rounded-lg bg-[#F3EFEA] text-[11px] font-bold text-[#141413] cursor-pointer"
          >
            주간 비교 ▾
          </button>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <strong className="text-2xl font-extrabold text-[#141413] tabular-nums">
            {isTeacher ? `${classAvgPoints}점` : `${myPoints}점`}
          </strong>
          <span className="bg-[#F8DFC2] rounded-xl px-2.5 py-1 text-[11px] font-bold text-[#141413] tabular-nums">
            {isTeacher
              ? `👍 우리 반 활발히 참여 중!`
              : myPoints >= classAvgPoints
              ? `👍 학급 평균(${classAvgPoints}점)보다 +${myPoints - classAvgPoints}점!`
              : `🌱 학급 평균: ${classAvgPoints}점`}
          </span>
        </div>

        {/* Stacked Pastel Bars matching the reference screenshot */}
        <div className="grid grid-cols-6 gap-2 items-end pt-2 h-28">
          {stackedColumns.map((col) => (
            <div
              key={col.label}
              className={`flex flex-col items-center justify-end h-full rounded-xl p-1 ${
                col.active ? 'border-2 border-[#141413] bg-[#FBF9F5]' : ''
              }`}
            >
              <div className="w-full flex flex-col gap-0.5 rounded-lg overflow-hidden">
                <div
                  style={{ height: `${col.h1}px`, backgroundColor: '#F6D4D2' }}
                  className="w-full rounded-t-md"
                />
                <div
                  style={{ height: `${col.h2}px`, backgroundColor: '#C6F0DF' }}
                  className="w-full"
                />
                <div
                  style={{ height: `${col.h3}px`, backgroundColor: '#DDD5F8' }}
                  className="w-full rounded-b-md"
                />
              </div>
              <span
                className={`mt-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                  col.active ? 'bg-[#141413] text-white' : 'text-[#6B665E]'
                }`}
              >
                {col.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Cards ("최근 획득 뱃지 & 익명 라운지" matching "My courses" two-tone cards) */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold text-[#141413]">
          오늘의 마니또 뱃지 & 라운지 현황
        </h3>

        {/* Card 1: Two-Tone Pink Badge Card */}
        <div
          onClick={() =>
            isTeacher ? onTeacherNavigate('stats') : onStudentNavigate('badges')
          }
          role="button"
          tabIndex={0}
          className="rounded-[24px] p-4 bg-[#F6D4D2] relative overflow-hidden cursor-pointer transition-transform hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-xs">
                🌱
              </div>
              <span className="text-xs font-bold text-[#141413]">최근 마니또 뱃지</span>
            </div>
            <span className="bg-white rounded-lg px-2 py-0.5 text-[11px] font-extrabold text-[#141413] tabular-nums">
              ★ {badgeProgressList.filter((b) => b.progress.earned).length}/{badges.length}종
            </span>
          </div>

          <p className="text-sm font-extrabold text-[#141413] mb-1">
            {badgeProgressList.find((b) => b.progress.earned)?.badge.name ||
              '친절의 새싹 도전 중!'}
          </p>
          <p className="text-[11px] text-[#3D3A35]">
            클릭하여 5종 파스텔 뱃지 달성 조건 확인하기
          </p>
        </div>

        {/* Card 2: Two-Tone Peach Lounge Status Card */}
        <div
          onClick={() =>
            isTeacher ? onTeacherNavigate('lounge') : onStudentNavigate('lounge')
          }
          role="button"
          tabIndex={0}
          className="rounded-[24px] p-4 bg-[#F8DFC2] relative overflow-hidden cursor-pointer transition-transform hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-[#141413]">
                <MessageSquareHeart className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-[#141413]">익명 학급 라운지</span>
            </div>
            <span className="bg-white rounded-lg px-2 py-0.5 text-[11px] font-extrabold text-[#141413]">
              {loungeStatusText}
            </span>
          </div>

          <p className="text-sm font-extrabold text-[#141413] mb-1">
            {loungeSession?.title || '우리 반 익명 칭찬 라운지'}
          </p>
          <p className="text-[11px] text-[#3D3A35] tabular-nums">
            실시간 대기 {waitingCount}명 · 대화 참여 {activeCount}명
          </p>
        </div>
      </div>
    </aside>
  );
};
