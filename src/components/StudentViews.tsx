import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutGrid,
  Heart,
  Eye,
  HandHeart,
  Mail,
  Users,
  Sparkles,
  CheckCircle2,
  Clock,
  Send,
  ShieldAlert,
  RefreshCw,
  Lock,
  EyeOff,
  Award,
  TrendingUp,
  Calendar,
  MessageSquareHeart,
  ChevronRight,
  Search,
  Check,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
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
  LetterThread,
  Letter,
  LoungeSession,
  LoungeParticipant,
  LoungeMessage,
  AppSetting,
  StudentNavTab,
  ProfileVisibility,
} from '../types/manitto';
import {
  AVATAR_OPTIONS,
  ANONYMOUS_ALIASES,
  INTEREST_SUGGESTIONS,
  HOBBY_SUGGESTIONS,
} from '../data/seedData';
import { AvatarIllustration, BadgeArtwork } from './AvatarIllustration';
import {
  submitMissionAction,
  evaluateAndAwardBadges,
  getBadgeProgress,
  sendAnonymousLetter,
  submitSafetyReport,
  hashPassword,
  sanitizeText,
  containsProfanity,
  playCelebrationSound,
} from '../services/manittoServerEngine';

interface StudentContextProps {
  workspaceOwnerUid: string;
  currentStudent: UserProfile;
  allUsers: UserProfile[];
  missions: Mission[];
  submissions: MissionSubmission[];
  ledger: ScoreLedger[];
  stats: StudentStats[];
  badges: Badge[];
  badgeAwards: BadgeAward[];
  assignments: ManittoAssignment[];
  letterThreads: LetterThread[];
  letters: Letter[];
  loungeSession: LoungeSession | null;
  loungeParticipants: LoungeParticipant[];
  loungeMessages: LoungeMessage[];
  appSettings: AppSetting | null;
  onNavigate: (tab: StudentNavTab) => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const PASTEL_THEMES = [
  { bg: '#F6D4D2', hoverBg: '#F2C5C2', accent: '#E11D48', label: '친절·인사' },
  { bg: '#F8DFC2', hoverBg: '#F4D2AC', accent: '#D97706', label: '배려·도움' },
  { bg: '#DDD5F8', hoverBg: '#CFC4F4', accent: '#6366F1', label: '관찰·칭찬' },
  { bg: '#C6F0DF', hoverBg: '#B2E8D2', accent: '#059669', label: '학급 협력' },
];

export interface CelebrationData {
  title: string;
  subtitle: string;
  points?: number;
  badgeName?: string;
  icon: string;
}

export const StudentViews: React.FC<StudentContextProps & { activeTab: StudentNavTab }> = (
  props
) => {
  const { activeTab, currentStudent, submissions, badgeAwards, missions, badges } = props;
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [celebrationData, setCelebrationData] = useState<CelebrationData | null>(null);

  const handleShowCelebration = (data: CelebrationData) => {
    playCelebrationSound();
    setCelebrationData(data);
  };

  useEffect(() => {
    if (!currentStudent?.uid) return;

    const subKey = `seen_approved_subs_${currentStudent.uid}`;
    const badgeKey = `seen_badge_awards_${currentStudent.uid}`;

    // Read stored seen submission IDs
    let seenSubs = new Set<string>();
    const storedSubs = localStorage.getItem(subKey);
    if (storedSubs) {
      try {
        seenSubs = new Set(JSON.parse(storedSubs));
      } catch {
        /* ignore parse error */
      }
    } else {
      // First initialization: seed with existing approved submissions so we don't spam old ones
      submissions
        .filter((s) => s.studentUid === currentStudent.uid && s.status === 'approved')
        .forEach((s) => seenSubs.add(s.submissionId));
      localStorage.setItem(subKey, JSON.stringify(Array.from(seenSubs)));
    }

    // Read stored seen badge award IDs
    let seenBadges = new Set<string>();
    const storedBadges = localStorage.getItem(badgeKey);
    if (storedBadges) {
      try {
        seenBadges = new Set(JSON.parse(storedBadges));
      } catch {
        /* ignore parse error */
      }
    } else {
      // First initialization: seed with existing badge awards
      badgeAwards
        .filter((a) => a.studentUid === currentStudent.uid)
        .forEach((a) => seenBadges.add(a.awardId));
      localStorage.setItem(badgeKey, JSON.stringify(Array.from(seenBadges)));
    }

    // Detect newly teacher-approved submissions
    const newlyApproved = submissions.filter(
      (s) =>
        s.studentUid === currentStudent.uid &&
        s.status === 'approved' &&
        s.reviewedBy !== 'system_auto' &&
        !seenSubs.has(s.submissionId)
    );

    if (newlyApproved.length > 0) {
      const latest = newlyApproved[newlyApproved.length - 1];
      const m = missions.find((item) => item.missionId === latest.missionId);
      const mTitle = m ? m.title : '선생님 승인 미션';
      const pts = latest.awardedPoints || m?.points || 10;

      handleShowCelebration({
        title: '👨‍🏫 선생님이 미션을 승인하셨어요!',
        subtitle: `"${mTitle}" 미션을 선생님께서 확인하시고 승인하셨습니다!`,
        points: pts,
        icon: '🌸',
      });

      newlyApproved.forEach((s) => seenSubs.add(s.submissionId));
      localStorage.setItem(subKey, JSON.stringify(Array.from(seenSubs)));
      return;
    }

    // Detect newly awarded badges
    const newlyAwarded = badgeAwards.filter(
      (a) => a.studentUid === currentStudent.uid && !seenBadges.has(a.awardId)
    );

    if (newlyAwarded.length > 0) {
      const latestBadgeAward = newlyAwarded[newlyAwarded.length - 1];
      const b = badges.find((item) => item.badgeId === latestBadgeAward.badgeId);
      const bName = b ? b.name : '마니또 뱃지';

      handleShowCelebration({
        title: '🏆 뱃지 획득 완료!',
        subtitle: `축하해요! 뱃지 진행률 100% 달성하여 "${bName}" 뱃지를 새로 획득했어요!`,
        badgeName: bName,
        icon: '🏆',
      });

      newlyAwarded.forEach((a) => seenBadges.add(a.awardId));
      localStorage.setItem(badgeKey, JSON.stringify(Array.from(seenBadges)));
    }
  }, [submissions, badgeAwards, currentStudent?.uid, missions, badges]);

  return (
    <div className="w-full">
      {activeTab === 'home' && (
        <StudentHomeView {...props} onSelectMission={(m) => setSelectedMission(m)} />
      )}
      {activeTab === 'profile' && <StudentProfileView {...props} />}
      {activeTab === 'missions' && (
        <StudentMissionsView {...props} onSelectMission={(m) => setSelectedMission(m)} />
      )}
      {activeTab === 'growth' && <StudentGrowthView {...props} />}
      {activeTab === 'badges' && <StudentBadgesView {...props} />}
      {activeTab === 'letters' && <StudentLettersView {...props} />}
      {activeTab === 'lounge' && <StudentLoungeView {...props} />}
      {activeTab === 'settings' && <StudentSettingsView {...props} />}

      {selectedMission && (
        <MissionSubmissionModal
          {...props}
          mission={selectedMission}
          onClose={() => setSelectedMission(null)}
          onShowCelebration={handleShowCelebration}
        />
      )}

      {/* Celebration & Badge Unlocked Modal Popup */}
      {celebrationData && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FBF9F5] border-4 border-amber-300 rounded-[36px] max-w-sm w-full p-6 sm:p-8 text-center space-y-4 shadow-2xl relative overflow-hidden animate-scaleUp">
            <div className="w-20 h-20 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-4xl mx-auto shadow-sm ring-4 ring-amber-200 animate-bounce">
              {celebrationData.icon}
            </div>

            <div>
              <h2 className="text-xl font-extrabold text-[#141413]">
                {celebrationData.title}
              </h2>
              <p className="text-xs text-[#5C574F] mt-1.5 leading-relaxed font-semibold">
                {celebrationData.subtitle}
              </p>
            </div>

            {celebrationData.points && celebrationData.points > 0 ? (
              <div className="bg-[#C6F0DF] rounded-2xl p-3 border border-emerald-300">
                <span className="text-xs font-bold text-[#065F46] block">획득 보상 점수</span>
                <strong className="text-2xl font-extrabold text-[#065F46] tabular-nums">
                  +{celebrationData.points}점 ★
                </strong>
              </div>
            ) : null}

            {celebrationData.badgeName ? (
              <div className="bg-[#DDD5F8] rounded-2xl p-3 border border-indigo-300">
                <span className="text-xs font-bold text-[#3730A3] block">🏆 신규 뱃지 획득!</span>
                <strong className="text-sm font-extrabold text-[#3730A3]">
                  {celebrationData.badgeName}
                </strong>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setCelebrationData(null)}
              className="w-full py-3 rounded-2xl bg-[#141413] text-white text-xs font-extrabold hover:bg-[#2C2A27] cursor-pointer shadow-md transition-transform active:scale-95"
            >
              ✨ 참 잘했어요! 확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 1. STUDENT HOME DASHBOARD (Matches Reference Image Design)
 * ========================================================================== */
const StudentHomeView: React.FC<
  StudentContextProps & { onSelectMission: (m: Mission) => void }
> = ({
  currentStudent,
  allUsers,
  missions,
  submissions,
  stats,
  badges,
  badgeAwards,
  letters,
  onNavigate,
  onSelectMission,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const activeMissions = useMemo(
    () => missions.filter((m) => m.active).sort((a, b) => a.orderIndex - b.orderIndex),
    [missions]
  );

  const filteredMissions = useMemo(() => {
    if (categoryFilter === 'all') return activeMissions;
    return activeMissions.filter((m) => m.category === categoryFilter);
  }, [activeMissions, categoryFilter]);

  const mySubmissions = useMemo(
    () =>
      submissions
        .filter((s) => s.studentUid === currentStudent.uid && s.status !== 'deleted')
        .sort((a, b) => b.activityDate.localeCompare(a.activityDate)),
    [submissions, currentStudent.uid]
  );

  const myApprovedIds = useMemo(
    () =>
      new Set(
        mySubmissions.filter((s) => s.status === 'approved').map((s) => s.missionId)
      ),
    [mySubmissions]
  );

  const myPendingIds = useMemo(
    () =>
      new Set(
        mySubmissions.filter((s) => s.status === 'pending').map((s) => s.missionId)
      ),
    [mySubmissions]
  );

  const myStat = stats.find((s) => s.studentUid === currentStudent.uid);
  const myPoints = myStat?.totalPoints ?? 0;

  const activeStudents = allUsers.filter(
    (u) => u.role === 'student' && u.accountStatus === 'active'
  );
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
          l.receiverUid === currentStudent.uid &&
          !l.readAt &&
          l.moderationStatus !== 'hidden' &&
          !l.deletedAt
      ).length,
    [letters, currentStudent.uid]
  );

  const myEarnedBadgesCount = useMemo(
    () =>
      badges.filter((b) =>
        getBadgeProgress({
          badge: b,
          studentUid: currentStudent.uid,
          missions,
          submissions,
          sentLettersCount: letters.filter((l) => l.senderUid === currentStudent.uid).length,
          existingAwards: badgeAwards,
        }).earned
      ).length,
    [badges, currentStudent.uid, missions, submissions, letters, badgeAwards]
  );

  const filterTabs = [
    { id: 'all', label: '전체 미션', icon: LayoutGrid },
    { id: 'kindness', label: '친절·인사', icon: Heart },
    { id: 'observation', label: '관찰·장점', icon: Eye },
    { id: 'care', label: '배려·도움', icon: HandHeart },
    { id: 'gratitude', label: '감사·편지', icon: Mail },
    { id: 'cooperation', label: '학급 협력', icon: Users },
  ];

  // Pick top 4 featured missions for the 2x2 pastel showcase grid
  const featuredMissions = filteredMissions.slice(0, 4);

  return (
    <div className="space-y-8">
      {/* Hero Headline (Matches "Invest in your education" editorial layout) */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-1">
        <div>
          <p className="text-sm font-medium text-[#6B665E] mb-1.5">
            전주신동초등학교 · 5학년 2반 해바라기반
          </p>
          <h1
            className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-[#141413] tracking-tight leading-[1.15]"
            style={{ textWrap: 'balance' }}
          >
            오늘도 작은 친절을
            <br />
            실천해 볼까요?
          </h1>
        </div>

        {/* Summary Quick Strip */}
        <div className="flex items-center gap-4 bg-[#F2EFE9] rounded-2xl px-4 py-3 text-xs text-[#4A463F]">
          <div>
            <span className="text-[#787268]">완료 미션</span>{' '}
            <strong className="font-bold text-[#141413] tabular-nums">
              {myApprovedIds.size} / {activeMissions.length}개
            </strong>
          </div>
          <span aria-hidden="true">·</span>
          <div>
            <span className="text-[#787268]">획득 뱃지</span>{' '}
            <strong className="font-bold text-[#141413] tabular-nums">
              {myEarnedBadgesCount} / {badges.length}종
            </strong>
          </div>
          <span aria-hidden="true">·</span>
          <button
            onClick={() => onNavigate('letters')}
            className="hover:underline font-semibold text-[#141413] tabular-nums whitespace-nowrap shrink-0"
          >
            새 편지 {unreadLettersCount}통
          </button>
        </div>
      </div>

      {/* Category Filter Buttons (Matches Reference Image Capsule Button Strip) */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-1 no-scrollbar">
        {filterTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = categoryFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCategoryFilter(tab.id)}
              className={`flex items-center gap-2.5 pl-2 pr-4 py-2 rounded-full text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[#141413] text-white shadow-xs'
                  : 'bg-[#F1EEE8] text-[#141413] hover:bg-[#E7E2D8]'
              }`}
            >
              <span className="w-8 h-8 rounded-full bg-white text-[#141413] flex items-center justify-center shrink-0 shadow-2xs">
                <Icon className="w-4 h-4" />
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2x2 Pastel Cards Section ("추천 마니또 미션") */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-[#141413]">추천 마니또 미션</h2>
          <button
            onClick={() => onNavigate('missions')}
            className="text-xs font-semibold text-[#5C574F] hover:text-[#141413] flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>전체 20개 미션 보기</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {featuredMissions.map((mission, idx) => {
            const theme = PASTEL_THEMES[idx % PASTEL_THEMES.length];
            const isDone = myApprovedIds.has(mission.missionId);
            const isPending = myPendingIds.has(mission.missionId);
            const completedClassmates = submissions.filter(
              (s) => s.missionId === mission.missionId && s.status === 'approved'
            );

            return (
              <div
                key={mission.missionId}
                onClick={() => onSelectMission(mission)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectMission(mission);
                  }
                }}
                style={{ backgroundColor: theme.bg }}
                className="rounded-[28px] p-6 flex flex-col justify-between min-h-[210px] transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer text-left"
              >
                {/* Card Top Row: White Icon Box + Category text | White Rating/Score Box */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-[#141413] shadow-2xs">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-[#2C2A27]">
                      미션 {String(mission.orderIndex).padStart(2, '0')} ·{' '}
                      {mission.requiresTeacherApproval ? '선생님 확인' : '자동 완료'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div className="bg-white rounded-xl px-2.5 py-1 text-xs font-bold text-[#141413] flex items-center gap-1 tabular-nums shadow-2xs">
                      <span className="text-amber-500">★</span>
                      <span>+{mission.points}점</span>
                    </div>
                    {isDone && (
                      <div className="bg-white rounded-xl px-2.5 py-1 text-xs font-bold text-emerald-700 flex items-center gap-1 shadow-2xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>완료</span>
                      </div>
                    )}
                    {!isDone && isPending && (
                      <div className="bg-white rounded-xl px-2.5 py-1 text-xs font-bold text-amber-700 flex items-center gap-1 shadow-2xs">
                        <Clock className="w-3.5 h-3.5" />
                        <span>승인 대기</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Middle: Bold Mission Title & Short Description */}
                <div className="my-4">
                  <h3 className="text-lg sm:text-xl font-bold text-[#141413] leading-snug mb-1.5">
                    {mission.title}
                  </h3>
                  <p className="text-xs text-[#3D3A35] line-clamp-2 leading-relaxed">
                    {mission.description}
                  </p>
                </div>

                {/* Card Bottom: Participation Count + Overlapping Student Avatars */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-semibold text-[#2C2A27] tabular-nums">
                    우리 반 {completedClassmates.length}명 실천 완료
                  </span>

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
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Split: Recent Practice Records & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
        {/* Recent Mission Submissions */}
        <div className="lg:col-span-7 bg-[#F3EFEA] rounded-[28px] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#141413]">최근 나의 친절 실천 기록</h2>
            <button
              onClick={() => onNavigate('growth')}
              className="text-xs font-semibold text-[#5C574F] hover:text-[#141413] cursor-pointer whitespace-nowrap shrink-0"
            >
              성장 그래프 보기 →
            </button>
          </div>

          {mySubmissions.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center">
              <p className="text-sm font-semibold text-[#141413] mb-1">
                아직 작성한 친절 실천 기록이 없어요
              </p>
              <p className="text-xs text-[#6B665E] mb-4">
                위의 추천 미션 카드를 눌러 첫 번째 친절을 기록해 보세요!
              </p>
              <button
                onClick={() => onNavigate('missions')}
                className="px-4 py-2 rounded-xl bg-[#141413] text-white text-xs font-semibold cursor-pointer"
              >
                첫 미션 시작하기
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {mySubmissions.slice(0, 4).map((sub) => {
                const m = missions.find((x) => x.missionId === sub.missionId);
                return (
                  <div
                    key={sub.submissionId}
                    className="bg-white rounded-2xl p-4 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-[#6B665E] mb-1">
                        <span className="font-semibold text-[#141413]">
                          {m?.title || '마니또 미션'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{sub.activityDate}</span>
                      </div>
                      <p className="text-xs text-[#4A463F] line-clamp-1">
                        {sub.actionDescription}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      {sub.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 tabular-nums">
                          <CheckCircle2 className="w-3.5 h-3.5" />+{sub.awardedPoints}점
                        </span>
                      ) : sub.status === 'pending' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                          <Clock className="w-3.5 h-3.5" />
                          승인 대기
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-rose-600">반려됨</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* My Score vs Class Average Card */}
        <div className="lg:col-span-5 bg-[#F3EFEA] rounded-[28px] p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-[#141413] mb-1">
              우리 반 따뜻한 성장 온도
            </h2>
            <p className="text-xs text-[#6B665E] mb-5">
              누가 1등인지 경쟁하지 않고, 어제의 나보다 더 따뜻한 오늘을 만들어요.
            </p>

            <div className="bg-white rounded-2xl p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-[#141413]">나의 친절 점수</span>
                  <span className="font-bold text-[#141413] tabular-nums">{myPoints}점</span>
                </div>
                <div className="w-full h-3 bg-[#F1EEE8] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#10B981] rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(10, (myPoints / 120) * 100))}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-[#6B665E]">우리 반 평균 점수</span>
                  <span className="font-bold text-[#6B665E] tabular-nums">
                    {classAvgPoints}점
                  </span>
                </div>
                <div className="w-full h-3 bg-[#F1EEE8] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#818CF8] rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.max(10, (classAvgPoints / 120) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between bg-[#F8DFC2] rounded-2xl px-4 py-3">
            <span className="text-xs font-bold text-[#141413]">
              {myPoints >= classAvgPoints
                ? `👍 학급 평균보다 ${myPoints - classAvgPoints}점 높아요!`
                : `🌱 미션 1개만 더 하면 평균(${classAvgPoints}점)에 가까워져요!`}
            </span>
            <button
              onClick={() => onNavigate('letters')}
              className="text-xs font-bold text-[#141413] underline cursor-pointer whitespace-nowrap shrink-0"
            >
              마니또 편지 쓰기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 2. MISSION SUBMISSION MODAL
 * ========================================================================== */
const MissionSubmissionModal: React.FC<
  StudentContextProps & {
    mission: Mission;
    onClose: () => void;
    onShowCelebration: (data: CelebrationData) => void;
  }
> = ({
  workspaceOwnerUid,
  currentStudent,
  mission,
  missions,
  submissions,
  letters,
  badges,
  badgeAwards,
  appSettings,
  onClose,
  onNotify,
  onShowCelebration,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [actionDescription, setActionDescription] = useState('');
  const [reflection, setReflection] = useState('');
  const [activityDate, setActivityDate] = useState(todayStr);
  const [evidenceNote, setEvidenceNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const mySubsForMission = submissions.filter(
    (s) =>
      s.studentUid === currentStudent.uid &&
      s.missionId === mission.missionId &&
      s.status !== 'deleted'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await submitMissionAction({
        workspaceOwnerUid,
        studentUid: currentStudent.uid,
        classId: currentStudent.classId,
        mission,
        actionDescription,
        reflection,
        activityDate,
        evidenceNote,
        existingSubmissions: submissions,
      });

      let newBadges: string[] = [];
      // Check and award badges automatically if approved
      if (result.status === 'approved') {
        const fakeNewSub: MissionSubmission = {
          submissionId: 'temp',
          workspaceOwnerUid,
          missionId: mission.missionId,
          studentUid: currentStudent.uid,
          classId: currentStudent.classId,
          actionDescription,
          reflection,
          activityDate,
          evidenceNote,
          status: 'approved',
          awardedPoints: mission.points,
          reviewedBy: 'system_auto',
          reviewedAt: new Date().toISOString(),
          reviewComment: '',
        };
        newBadges = await evaluateAndAwardBadges({
          workspaceOwnerUid,
          studentUid: currentStudent.uid,
          classId: currentStudent.classId,
          missions,
          submissions: [...submissions, fakeNewSub],
          sentLettersCount: letters.filter((l) => l.senderUid === currentStudent.uid).length,
          badges,
          existingAwards: badgeAwards,
        });
      }

      // Trigger Celebration Sound and Popup
      onShowCelebration({
        title: result.status === 'approved' ? '🎉 미션 실천 완료 및 점수 획득!' : '📩 선생님 확인 미션 제출 완료!',
        subtitle: result.status === 'approved'
          ? `[${mission.title}] 미션을 멋지게 완수하여 점수가 반영되었어요!`
          : `미션이 성공적으로 전송되었어요. 선생님이 확인하신 후 점수가 지급됩니다.`,
        points: result.status === 'approved' ? mission.points : undefined,
        badgeName: newBadges.length > 0 ? newBadges.join(', ') : undefined,
        icon: newBadges.length > 0 ? '🏆' : result.status === 'approved' ? '⭐' : '📝',
      });

      onClose();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '미션 제출 중 오류가 발생했습니다.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FBF9F5] border border-[#E6E1D6] rounded-[32px] max-w-xl w-full p-6 sm:p-8 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-semibold text-[#6B665E] mb-1">
              미션 {String(mission.orderIndex).padStart(2, '0')} · 보상 +{mission.points}점 ·{' '}
              {mission.requiresTeacherApproval ? '선생님 확인 후 완료' : '기록 즉시 자동 완료'}
            </p>
            <h2 className="text-xl font-extrabold text-[#141413]">{mission.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-[#EFECE6] text-xs font-bold text-[#141413] hover:bg-[#E2DDD3] cursor-pointer"
          >
            닫기
          </button>
        </div>

        <div className="bg-[#F3EFEA] rounded-2xl p-4 mb-5 space-y-1.5">
          <p className="text-xs font-bold text-[#141413]">💡 어떻게 실천할까요?</p>
          <p className="text-xs text-[#4A463F] leading-relaxed">{mission.howTo}</p>
          <p className="text-[11px] text-[#787268] pt-1">
            최대 달성 가능 횟수: {mission.maxCompletions}회 (현재 나의 기록:{' '}
            {mySubsForMission.length}회)
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1.5">
              1. 실천한 날짜
            </label>
            <input
              type="date"
              max={todayStr}
              value={activityDate}
              onChange={(e) => setActivityDate(e.target.value)}
              required
              className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2.5 text-sm text-[#141413] focus:outline-none focus:border-[#141413]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1.5">
              2. 실제로 실천한 행동 (구체적으로 적어 주세요)
            </label>
            <textarea
              rows={3}
              value={actionDescription}
              onChange={(e) => setActionDescription(e.target.value)}
              placeholder="예: 아침에 교실에 들어오면서 마니또와 짝꿍에게 먼저 밝게 손 흔들며 인사했어요."
              required
              maxLength={500}
              className="w-full rounded-xl bg-white border border-[#E2DDD3] p-3.5 text-sm text-[#141413] focus:outline-none focus:border-[#141413]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1.5">
              3. 실천 소감 (내 마음이나 친구의 반응은 어땠나요?)
            </label>
            <textarea
              rows={3}
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="예: 친구가 환하게 웃어 주어서 내 마음까지 따뜻해졌어요!"
              required
              maxLength={500}
              className="w-full rounded-xl bg-white border border-[#E2DDD3] p-3.5 text-sm text-[#141413] focus:outline-none focus:border-[#141413]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1.5">
              4. 실천 장소 또는 추가 메모 (선택){' '}
              {appSettings?.allowPhotoEvidence ? '· 사진/증빙 설명 가능' : '· 개인정보 보호를 위해 사진 업로드 제한 중'}
            </label>
            <input
              type="text"
              value={evidenceNote}
              onChange={(e) => setEvidenceNote(e.target.value)}
              placeholder="예: 5학년 2반 교실, 쉬는 시간"
              maxLength={200}
              className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2.5 text-sm text-[#141413] focus:outline-none focus:border-[#141413]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-[#EFECE6] text-xs font-bold text-[#141413] hover:bg-[#E2DDD3] cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-[#141413] text-xs font-bold text-white hover:bg-[#2C2A27] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? '저장 중...' : '친절 실천 기록 저장하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* ============================================================================
 * 3. STUDENT PROFILE & MANITTO TARGET PROFILE VIEW
 * ========================================================================== */
const StudentProfileView: React.FC<StudentContextProps> = ({
  currentStudent,
  allUsers,
  assignments,
  appSettings,
  onNotify,
}) => {
  const [displayName, setDisplayName] = useState(currentStudent.displayName);
  const [avatarId, setAvatarId] = useState(currentStudent.avatarId);
  const [bio, setBio] = useState(currentStudent.bio);
  const [interests, setInterests] = useState<string[]>(currentStudent.interests);
  const [hobbies, setHobbies] = useState<string[]>(currentStudent.hobbies);
  const [favoriteFood, setFavoriteFood] = useState(currentStudent.favoriteFood);
  const [strengths, setStrengths] = useState(currentStudent.strengths);
  const [cheerWanted, setCheerWanted] = useState(currentStudent.cheerWanted);
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>(
    currentStudent.profileVisibility
  );
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // Find who currentStudent is taking care of (receiverUid)
  const myManittoAssignment = assignments.find(
    (a) => a.active && a.giverUid === currentStudent.uid
  );
  const myTargetFriend = allUsers.find((u) => u.uid === myManittoAssignment?.receiverUid);

  // Find who is taking care of currentStudent (only revealed if teacher sets identityRevealPolicy === 'revealed')
  const secretGiverAssignment = assignments.find(
    (a) => a.active && a.receiverUid === currentStudent.uid
  );
  const secretGiverFriend =
    appSettings?.identityRevealPolicy === 'revealed'
      ? allUsers.find((u) => u.uid === secretGiverAssignment?.giverUid)
      : null;

  const toggleItem = (list: string[], item: string, setter: (v: string[]) => void) => {
    if (list.includes(item)) {
      setter(list.filter((x) => x !== item));
    } else if (list.length < 8) {
      setter([...list, item]);
    } else {
      onNotify('최대 8개까지 선택할 수 있어요.', 'info');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        displayName: sanitizeText(displayName, 60),
        avatarId,
        bio: sanitizeText(bio, 300),
        interests,
        hobbies,
        favoriteFood: sanitizeText(favoriteFood, 120),
        strengths: sanitizeText(strengths, 200),
        cheerWanted: sanitizeText(cheerWanted, 200),
        profileVisibility,
        updatedAt: serverTimestamp(),
      };
      if (newPassword.trim().length > 0) {
        if (newPassword.trim().length < 4) {
          throw new Error('새 비밀번호는 4자리 이상으로 입력해 주세요.');
        }
        updates.passwordHash = await hashPassword(newPassword.trim());
      }
      await updateDoc(doc(db, 'users', currentStudent.uid), updates);
      setNewPassword('');
      onNotify('나의 프로필과 공개 범위가 안전하게 저장되었어요!', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '프로필 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#6B665E] mb-1">나의 프로필과 관심사 꾸미기</p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
          나를 소개하고 마니또 힌트를 남겨요
        </h1>
      </div>

      {/* Manitto Friend Profile Hint Box */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#C6F0DF] rounded-[28px] p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#065F46]">
              🌱 내가 몰래 챙겨주는 마니또 대상 친구
            </span>
            <span className="bg-white rounded-xl px-2.5 py-1 text-xs font-bold text-[#141413]">
              비밀 유지 필수!
            </span>
          </div>
          {myTargetFriend ? (
            <div className="bg-white rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center gap-3">
                <AvatarIllustration avatarId={myTargetFriend.avatarId} size="md" />
                <div>
                  <h3 className="text-base font-extrabold text-[#141413]">
                    {myTargetFriend.displayName} 친구
                  </h3>
                  <p className="text-xs text-[#6B665E]">
                    공개 설정:{' '}
                    {myTargetFriend.profileVisibility === 'private'
                      ? '비공개 (기본 이름만 표시)'
                      : myTargetFriend.profileVisibility === 'manitto'
                      ? '담당 마니또인 나에게 공개됨'
                      : '우리 반 전체 공개'}
                  </p>
                </div>
              </div>

              {myTargetFriend.profileVisibility === 'private' ? (
                <p className="text-xs text-[#6B665E] bg-[#F3EFEA] rounded-xl p-3">
                  친구가 아직 상세 프로필을 비공개로 설정했어요. 교실에서 친구의 장점을 직접 관찰해 볼까요?
                </p>
              ) : (
                <div className="text-xs text-[#3D3A35] space-y-1.5 pt-1">
                  <p>
                    <strong>자기소개:</strong> {myTargetFriend.bio || '등록된 소개가 없어요.'}
                  </p>
                  <p>
                    <strong>관심사:</strong> {myTargetFriend.interests.join(', ') || '없음'} ·{' '}
                    <strong>취미:</strong> {myTargetFriend.hobbies.join(', ') || '없음'}
                  </p>
                  <p>
                    <strong>좋아하는 음식/활동:</strong> {myTargetFriend.favoriteFood || '미입력'}
                  </p>
                  <p>
                    <strong>받고 싶은 응원:</strong> {myTargetFriend.cheerWanted || '미입력'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-[#065F46]">아직 선생님이 마니또를 배정하지 않았어요.</p>
          )}
        </div>

        <div className="bg-[#DDD5F8] rounded-[28px] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#3730A3]">
                💌 나를 몰래 도와주는 마니또는 누구일까요?
              </span>
              <span className="bg-white rounded-xl px-2.5 py-1 text-xs font-bold text-[#141413]">
                {appSettings?.identityRevealPolicy === 'revealed' ? '공개 완료!' : '마니또 비밀 정책'}
              </span>
            </div>

            {secretGiverFriend ? (
              <div className="bg-white rounded-2xl p-4 flex items-center gap-3">
                <AvatarIllustration avatarId={secretGiverFriend.avatarId} size="md" />
                <div>
                  <p className="text-xs text-[#6B665E]">선생님이 마니또를 공개했어요!</p>
                  <h3 className="text-base font-extrabold text-[#141413]">
                    나의 마니또는 [{secretGiverFriend.displayName}] 친구였어요! 🎉
                  </h3>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-4 space-y-2">
                <p className="text-sm font-bold text-[#141413]">
                  선생님이 정한 공개 날까지 마니또의 이름은 비밀이에요 🤫
                </p>
                <p className="text-xs text-[#5C574F] leading-relaxed">
                  아래에서 나의 관심사와 받고 싶은 응원을 적어 두면, 나의 마니또가 내 프로필을 보고 깜짝 친절과 응원 편지를 보내줄 거예요!
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Profile Edit Form */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-[#F3EFEA] rounded-[28px] p-6 sm:p-8 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2DDD3] pb-5">
          <div className="flex items-center gap-4">
            <AvatarIllustration avatarId={avatarId} size="lg" />
            <div>
              <h2 className="text-lg font-extrabold text-[#141413]">{displayName}</h2>
              <p className="text-xs text-[#6B665E]">
                로그인 아이디: {currentStudent.studentLoginId} · 전주신동초 5학년 2반
              </p>
            </div>
          </div>

          {/* Visibility Selector */}
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1">
              프로필 공개 범위 설정
            </label>
            <select
              value={profileVisibility}
              onChange={(e) => setProfileVisibility(e.target.value as ProfileVisibility)}
              className="rounded-xl bg-white border border-[#D6D1C7] px-3.5 py-2 text-xs font-bold text-[#141413]"
            >
              <option value="private">🔒 나만 보기 (비공개)</option>
              <option value="manitto">💌 배정된 마니또에게만 공개 (추천)</option>
              <option value="class">🏫 우리 반 전체에 공개</option>
            </select>
          </div>
        </div>

        {/* Avatar Picker */}
        <div>
          <label className="block text-xs font-bold text-[#141413] mb-2">
            캐릭터 아바타 선택
          </label>
          <div className="flex flex-wrap gap-2.5">
            {AVATAR_OPTIONS.filter((a) => a.id !== 'teacher').map((av) => (
              <button
                key={av.id}
                type="button"
                onClick={() => setAvatarId(av.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                  avatarId === av.id
                    ? 'bg-[#141413] text-white shadow-xs'
                    : 'bg-white text-[#141413] hover:bg-[#E7E2D8]'
                }`}
              >
                <span className="text-base">{av.emoji}</span>
                <span>{av.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1.5">
              표시 이름 또는 별명
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
              required
              className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2.5 text-sm text-[#141413]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1.5">
              좋아하는 음식이나 활동
            </label>
            <input
              type="text"
              value={favoriteFood}
              onChange={(e) => setFavoriteFood(e.target.value)}
              placeholder="예: 떡볶이, 복숭아, 피구하기"
              maxLength={120}
              className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2.5 text-sm text-[#141413]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#141413] mb-1.5">
            한 줄 자기소개 (전화번호·집주소 등 민감한 개인정보는 적지 않아요)
          </label>
          <textarea
            rows={2}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={300}
            className="w-full rounded-xl bg-white border border-[#E2DDD3] p-3 text-sm text-[#141413]"
          />
        </div>

        {/* Interests Selection */}
        <div>
          <label className="block text-xs font-bold text-[#141413] mb-2">
            나의 관심사 선택 (클릭해서 선택/해제)
          </label>
          <div className="flex flex-wrap gap-2">
            {INTEREST_SUGGESTIONS.map((item) => {
              const selected = interests.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleItem(interests, item, setInterests)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                    selected
                      ? 'bg-[#141413] text-white'
                      : 'bg-white text-[#4A463F] hover:bg-[#E7E2D8]'
                  }`}
                >
                  {selected ? `✓ ${item}` : item}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hobbies Selection */}
        <div>
          <label className="block text-xs font-bold text-[#141413] mb-2">
            나의 취미 선택
          </label>
          <div className="flex flex-wrap gap-2">
            {HOBBY_SUGGESTIONS.map((item) => {
              const selected = hobbies.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleItem(hobbies, item, setHobbies)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                    selected
                      ? 'bg-[#141413] text-white'
                      : 'bg-white text-[#4A463F] hover:bg-[#E7E2D8]'
                  }`}
                >
                  {selected ? `✓ ${item}` : item}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1.5">나의 장점</label>
            <input
              type="text"
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              placeholder="예: 친구 이야기를 끝까지 잘 들어주어요"
              maxLength={200}
              className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2.5 text-sm text-[#141413]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1.5">
              친구에게 받고 싶은 응원 한마디
            </label>
            <input
              type="text"
              value={cheerWanted}
              onChange={(e) => setCheerWanted(e.target.value)}
              placeholder="예: 오늘도 웃는 모습이 멋지다고 응원해 주세요!"
              maxLength={200}
              className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2.5 text-sm text-[#141413]"
            />
          </div>
        </div>

        <div className="border-t border-[#E2DDD3] pt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="w-full sm:w-72">
            <label className="block text-xs font-bold text-[#141413] mb-1.5">
              비밀번호 변경 (변경할 때만 입력 · 암호화 저장)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="새 비밀번호 입력 (선택)"
              className="w-full rounded-xl bg-white border border-[#E2DDD3] px-3.5 py-2 text-sm text-[#141413]"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 rounded-2xl bg-[#141413] text-white text-xs font-bold hover:bg-[#2C2A27] cursor-pointer whitespace-nowrap shrink-0"
          >
            {saving ? '저장 중...' : '프로필 및 공개 설정 저장하기'}
          </button>
        </div>
      </form>
    </div>
  );
};

/* ============================================================================
 * 4. ALL 20 MISSIONS VIEW
 * ========================================================================== */
const StudentMissionsView: React.FC<
  StudentContextProps & { onSelectMission: (m: Mission) => void }
> = ({ currentStudent, missions, submissions, onSelectMission }) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'todo' | 'pending' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const mySubs = useMemo(
    () =>
      submissions.filter(
        (s) => s.studentUid === currentStudent.uid && s.status !== 'deleted'
      ),
    [submissions, currentStudent.uid]
  );

  const getMissionState = (mission: Mission) => {
    const subs = mySubs.filter((s) => s.missionId === mission.missionId);
    const approvedCount = subs.filter((s) => s.status === 'approved').length;
    const pendingCount = subs.filter((s) => s.status === 'pending').length;
    const rejectedCount = subs.filter((s) => s.status === 'rejected').length;

    if (pendingCount > 0) return { code: 'pending', label: '승인 대기', approvedCount };
    if (approvedCount >= mission.maxCompletions || (!mission.allowRepeat && approvedCount >= 1)) {
      return { code: 'completed', label: '완료', approvedCount };
    }
    if (approvedCount > 0) {
      return { code: 'completed', label: `완료 (${approvedCount}회 · 다시 도전 가능)`, approvedCount };
    }
    if (rejectedCount > 0) {
      return { code: 'todo', label: '다시 도전하기', approvedCount };
    }
    return { code: 'todo', label: '시작 전', approvedCount: 0 };
  };

  const filteredMissions = useMemo(() => {
    return missions
      .filter((m) => m.active)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .filter((m) => {
        const st = getMissionState(m);
        if (statusFilter !== 'all' && st.code !== statusFilter) return false;
        if (
          searchQuery.trim() &&
          !m.title.includes(searchQuery.trim()) &&
          !m.description.includes(searchQuery.trim())
        ) {
          return false;
        }
        return true;
      });
  }, [missions, mySubs, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#6B665E] mb-1">
            친절 · 배려 · 감사 · 협력 · 관찰 미션 20개
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
            마니또 미션 20개 도전하기
          </h1>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#787268] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="미션 제목 검색..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#F3EFEA] text-xs text-[#141413] focus:outline-none focus:ring-1 focus:ring-[#141413]"
          />
        </div>
      </div>

      {/* Status Filter Segmented Controls */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { id: 'all', label: '전체 20개' },
          { id: 'todo', label: '시작 전 / 다시 도전' },
          { id: 'pending', label: '승인 대기 중' },
          { id: 'completed', label: '완료한 미션' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
            className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
              statusFilter === tab.id
                ? 'bg-[#141413] text-white'
                : 'bg-[#F3EFEA] text-[#4A463F] hover:bg-[#E6E1D6]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredMissions.map((mission, idx) => {
          const theme = PASTEL_THEMES[idx % PASTEL_THEMES.length];
          const st = getMissionState(mission);

          return (
            <div
              key={mission.missionId}
              style={{ backgroundColor: theme.bg }}
              className="rounded-[24px] p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="text-xs font-bold text-[#141413]">
                    미션 {String(mission.orderIndex).padStart(2, '0')} ·{' '}
                    {mission.requiresTeacherApproval ? '선생님 승인 필요' : '즉시 승인'}
                  </span>
                  <span className="bg-white rounded-xl px-2.5 py-1 text-xs font-extrabold text-[#141413] tabular-nums">
                    ★ +{mission.points}점
                  </span>
                </div>

                <h3 className="text-base font-extrabold text-[#141413] mb-1">
                  {mission.title}
                </h3>
                <p className="text-xs text-[#3D3A35] leading-relaxed">{mission.description}</p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-black/5">
                <span className="text-xs font-bold text-[#141413]">
                  상태: {st.label}
                </span>
                <button
                  onClick={() => onSelectMission(mission)}
                  className="px-3.5 py-1.5 rounded-xl bg-[#141413] text-white text-xs font-bold hover:bg-[#2C2A27] cursor-pointer whitespace-nowrap shrink-0"
                >
                  실천 기록 작성하기
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ============================================================================
 * 5. STUDENT GROWTH & CLASS AVERAGE CHARTS VIEW
 * ========================================================================== */
const StudentGrowthView: React.FC<StudentContextProps> = ({
  currentStudent,
  allUsers,
  ledger,
  stats,
  submissions,
}) => {
  const [periodDays, setPeriodDays] = useState<7 | 30>(7);

  const myStat = stats.find((s) => s.studentUid === currentStudent.uid);
  const myPoints = myStat?.totalPoints ?? 0;

  const activeStudents = allUsers.filter(
    (u) => u.role === 'student' && u.accountStatus === 'active'
  );
  const classAvgPoints = useMemo(() => {
    if (activeStudents.length === 0) return 0;
    const sum = activeStudents.reduce((acc, stu) => {
      const st = stats.find((x) => x.studentUid === stu.uid);
      return acc + (st?.totalPoints ?? 0);
    }, 0);
    return Math.round(sum / activeStudents.length);
  }, [activeStudents, stats]);

  // Build daily chart series for the past N days
  const chartData = useMemo(() => {
    const days: string[] = [];
    for (let i = periodDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      days.push(d.toISOString().slice(0, 10));
    }

    let runningMyTotal = 0;
    let runningClassTotal = 0;
    const studentCount = Math.max(1, activeStudents.length);

    return days.map((dateStr) => {
      const myDayPoints = ledger
        .filter((l) => l.studentUid === currentStudent.uid && l.activityDate === dateStr)
        .reduce((acc, cur) => acc + cur.pointsDelta, 0);

      const classDayPoints = ledger
        .filter((l) => l.activityDate === dateStr)
        .reduce((acc, cur) => acc + cur.pointsDelta, 0);

      runningMyTotal += myDayPoints;
      runningClassTotal += classDayPoints;

      return {
        date: dateStr.slice(5), // MM-DD
        나의일별점수: Math.max(0, myDayPoints),
        나의누적점수: Math.max(0, runningMyTotal),
        학급평균누적: Math.round(runningClassTotal / studentCount),
      };
    });
  }, [ledger, currentStudent.uid, activeStudents.length, periodDays]);

  const myLedger = useMemo(
    () =>
      ledger
        .filter((l) => l.studentUid === currentStudent.uid)
        .sort((a, b) => b.activityDate.localeCompare(a.activityDate)),
    [ledger, currentStudent.uid]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#6B665E] mb-1">
            나의 친절 성장 그래프 & 학급 평균 비교
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
            차곡차곡 쌓이는 나의 배려 발자국
          </h1>
        </div>

        <div className="flex items-center gap-2 bg-[#F3EFEA] p-1 rounded-xl">
          <button
            onClick={() => setPeriodDays(7)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              periodDays === 7 ? 'bg-[#141413] text-white' : 'text-[#4A463F]'
            }`}
          >
            최근 7일
          </button>
          <button
            onClick={() => setPeriodDays(30)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
              periodDays === 30 ? 'bg-[#141413] text-white' : 'text-[#4A463F]'
            }`}
          >
            최근 30일
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#C6F0DF] rounded-[24px] p-5">
          <span className="text-xs font-bold text-[#065F46]">나의 누적 점수</span>
          <p className="text-3xl font-extrabold text-[#141413] mt-1 tabular-nums">{myPoints}점</p>
          <p className="text-xs text-[#065F46] mt-1">승인 완료 미션 기준</p>
        </div>

        <div className="bg-[#DDD5F8] rounded-[24px] p-5">
          <span className="text-xs font-bold text-[#3730A3]">우리 반 평균 점수</span>
          <p className="text-3xl font-extrabold text-[#141413] mt-1 tabular-nums">
            {classAvgPoints}점
          </p>
          <p className="text-xs text-[#3730A3] mt-1">
            활성 학생 {activeStudents.length}명 평균
          </p>
        </div>

        <div className="bg-[#F8DFC2] rounded-[24px] p-5">
          <span className="text-xs font-bold text-[#92400E]">학급 평균과 비교</span>
          <p className="text-xl font-extrabold text-[#141413] mt-2">
            {myPoints >= classAvgPoints
              ? `평균보다 +${myPoints - classAvgPoints}점 높아요! 👍`
              : `평균까지 ${classAvgPoints - myPoints}점 남았어요! 🌱`}
          </p>
          <p className="text-xs text-[#92400E] mt-1">
            완료 미션 총 {myStat?.completedMissionCount ?? 0}회
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#F3EFEA] rounded-[28px] p-6">
          <h2 className="text-base font-bold text-[#141413] mb-1">
            누적 성장 및 학급 평균 비교 그래프
          </h2>
          <p className="text-xs text-[#6B665E] mb-4">
            최근 {periodDays}일 동안 나의 누적 점수와 우리 반 평균을 비교해요.
          </p>
          <div className="h-64 bg-white rounded-2xl p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFECE6" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="나의누적점수"
                  stroke="#10B981"
                  fill="#C6F0DF"
                  strokeWidth={2.5}
                />
                <Area
                  type="monotone"
                  dataKey="학급평균누적"
                  stroke="#6366F1"
                  fill="#DDD5F8"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#F3EFEA] rounded-[28px] p-6">
          <h2 className="text-base font-bold text-[#141413] mb-1">일별 친절 점수 획득 그래프</h2>
          <p className="text-xs text-[#6B665E] mb-4">
            매일 실천한 미션으로 획득한 일별 점수예요.
          </p>
          <div className="h-64 bg-white rounded-2xl p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFECE6" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="나의일별점수" fill="#F472B6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Personal Score Ledger Table */}
      <div className="bg-[#F3EFEA] rounded-[28px] p-6">
        <h2 className="text-base font-bold text-[#141413] mb-3">나의 점수 지급 내역 (원장 기록)</h2>
        <div className="bg-white rounded-2xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#EFECE6] text-xs text-[#6B665E]">
                <th className="py-3 px-4">날짜</th>
                <th className="py-3 px-4">내용</th>
                <th className="py-3 px-4">구분</th>
                <th className="py-3 px-4 text-right">점수 변동</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFECE6] text-xs">
              {myLedger.map((entry) => (
                <tr key={entry.ledgerId}>
                  <td className="py-3 px-4 tabular-nums text-[#6B665E]">{entry.activityDate}</td>
                  <td className="py-3 px-4 font-semibold text-[#141413]">{entry.reason}</td>
                  <td className="py-3 px-4 text-[#6B665E]">
                    {entry.sourceType === 'mission'
                      ? '미션 승인'
                      : entry.sourceType === 'adjustment'
                      ? '선생님 점수 조정'
                      : '점수 회수'}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-bold tabular-nums ${
                      entry.pointsDelta >= 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {entry.pointsDelta >= 0 ? `+${entry.pointsDelta}점` : `${entry.pointsDelta}점`}
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
 * 6. STUDENT 5 BADGES COLLECTION VIEW
 * ========================================================================== */
const StudentBadgesView: React.FC<StudentContextProps> = ({
  currentStudent,
  missions,
  submissions,
  letters,
  badges,
  badgeAwards,
}) => {
  const sentLettersCount = useMemo(
    () => letters.filter((l) => l.senderUid === currentStudent.uid).length,
    [letters, currentStudent.uid]
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#6B665E] mb-1">
          전주신동초 마니또 활동 뱃지 컬렉션 5종
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
          나의 따뜻한 마니또 뱃지 도감
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {badges.map((badge, idx) => {
          const prog = getBadgeProgress({
            badge,
            studentUid: currentStudent.uid,
            missions,
            submissions,
            sentLettersCount,
            existingAwards: badgeAwards,
          });
          const theme = PASTEL_THEMES[idx % PASTEL_THEMES.length];

          return (
            <div
              key={badge.badgeId}
              style={{ backgroundColor: prog.earned ? theme.bg : '#F3EFEA' }}
              className="rounded-[28px] p-6 flex flex-col justify-between gap-4"
            >
              <div className="flex items-start justify-between gap-3">
                <BadgeArtwork badgeId={badge.badgeId} earned={prog.earned} size="lg" />
                <div className="bg-white rounded-xl px-3 py-1 text-xs font-bold text-[#141413] tabular-nums">
                  {prog.earned ? `🎉 획득 완료 (${prog.awardedAt || '달성'})` : `${prog.percentage}% 달성`}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-[#141413] mb-1">
                  {badge.icon} {badge.name}
                </h3>
                <p className="text-xs text-[#3D3A35] leading-relaxed mb-3">
                  {badge.description}
                </p>
                <p className="text-[11px] font-semibold text-[#5C574F]">
                  획득 조건: {badge.criteria}
                </p>
              </div>

              <div className="bg-white/80 rounded-2xl p-3.5">
                <div className="flex items-center justify-between text-xs font-bold text-[#141413] mb-1.5 tabular-nums">
                  <span>진행률</span>
                  <span>
                    {prog.current} / {prog.target} 완료 ({prog.percentage}% 달성)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-[#E6E1D6] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#141413] rounded-full transition-all duration-300"
                    style={{ width: `${prog.percentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ============================================================================
 * 7. ANONYMOUS LETTERBOX & REPLY VIEW
 * ========================================================================== */
const StudentLettersView: React.FC<StudentContextProps> = ({
  workspaceOwnerUid,
  currentStudent,
  missions,
  submissions,
  badges,
  badgeAwards,
  assignments,
  letterThreads,
  letters,
  onNotify,
}) => {
  const [boxTab, setBoxTab] = useState<'inbox' | 'sent' | 'compose'>('inbox');
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null);
  const [direction, setDirection] = useState<'from_manitto' | 'to_manitto'>('from_manitto');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportingLetter, setReportingLetter] = useState<Letter | null>(null);

  const inboxLetters = useMemo(
    () =>
      letters.filter(
        (l) =>
          l.receiverUid === currentStudent.uid &&
          l.moderationStatus !== 'hidden' &&
          !l.deletedAt
      ),
    [letters, currentStudent.uid]
  );

  const sentLetters = useMemo(
    () =>
      letters.filter(
        (l) =>
          l.senderUid === currentStudent.uid &&
          l.moderationStatus !== 'hidden' &&
          !l.deletedAt
      ),
    [letters, currentStudent.uid]
  );

  const handleOpenLetter = async (letter: Letter) => {
    setSelectedLetter(letter);
    if (letter.receiverUid === currentStudent.uid && !letter.readAt) {
      try {
        await updateDoc(doc(db, 'letters', letter.letterId), {
          readAt: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore read receipt error
      }
    }
  };

  const handleSendLetter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      await sendAnonymousLetter({
        workspaceOwnerUid,
        senderUid: currentStudent.uid,
        classId: currentStudent.classId,
        direction,
        subject,
        body,
        assignments,
        threads: letterThreads,
      });

      // Evaluate badge 02 (마음 전달자 - 편지 3회 작성)
      const newBadges = await evaluateAndAwardBadges({
        workspaceOwnerUid,
        studentUid: currentStudent.uid,
        classId: currentStudent.classId,
        missions,
        submissions,
        sentLettersCount: sentLetters.length + 1,
        badges,
        existingAwards: badgeAwards,
      });

      setSubject('');
      setBody('');
      setBoxTab('sent');
      if (newBadges.length > 0) {
        onNotify(
          `따뜻한 익명 편지를 보냈어요! 💌 [${newBadges.join(', ')}] 뱃지도 획득했어요!`,
          'success'
        );
      } else {
        onNotify('따뜻한 익명 편지가 성공적으로 전달되었어요! 💌', 'success');
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '편지 전송 실패', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleReplyToSelected = (letter: Letter) => {
    // If the letter came 'from_manitto' (my secret Manitto wrote to me), I reply 'to_manitto'
    const replyDir = letter.senderDirection === 'from_manitto' ? 'to_manitto' : 'from_manitto';
    setDirection(replyDir);
    setSubject(`답장: ${letter.subject}`);
    setSelectedLetter(null);
    setBoxTab('compose');
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingLetter) return;
    try {
      await submitSafetyReport({
        workspaceOwnerUid,
        classId: currentStudent.classId,
        reporterUid: currentStudent.uid,
        targetType: 'letter',
        targetId: reportingLetter.letterId,
        targetPreview: `${reportingLetter.subject}: ${reportingLetter.body}`,
        reason: reportReason,
      });
      setReportingLetter(null);
      setReportReason('');
      onNotify('선생님께 편지 신고가 접수되었습니다. 안전하게 검토할게요.', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '신고 접수 실패', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#6B665E] mb-1">
            마니또와 주고받는 따뜻한 비밀 우체통
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
            익명 마니또 편지함
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setBoxTab('inbox')}
            className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
              boxTab === 'inbox' ? 'bg-[#141413] text-white' : 'bg-[#F3EFEA] text-[#141413]'
            }`}
          >
            받은 편지함 ({inboxLetters.length})
          </button>
          <button
            onClick={() => setBoxTab('sent')}
            className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
              boxTab === 'sent' ? 'bg-[#141413] text-white' : 'bg-[#F3EFEA] text-[#141413]'
            }`}
          >
            보낸 편지함 ({sentLetters.length})
          </button>
          <button
            onClick={() => setBoxTab('compose')}
            className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
              boxTab === 'compose'
                ? 'bg-[#141413] text-white'
                : 'bg-[#F8DFC2] text-[#141413] hover:bg-[#F4D2AC]'
            }`}
          >
            + 새 익명 편지 쓰기
          </button>
        </div>
      </div>

      {/* Safety Notice */}
      <div className="bg-[#F3EFEA] rounded-2xl px-4 py-3 text-xs text-[#5C574F] flex items-center justify-between gap-3">
        <span>
          💌 익명 편지함은 배정된 마니또 관계끼리만 주고받을 수 있으며 상대방의 실명은 표시되지 않아요. 단, 부적절한 편지 신고 시 담임선생님이 안전을 위해 확인할 수 있어요.
        </span>
      </div>

      {boxTab === 'compose' ? (
        <form
          onSubmit={handleSendLetter}
          className="bg-[#FEF9C3] rounded-[28px] p-6 sm:p-8 space-y-4"
        >
          <h2 className="text-lg font-extrabold text-[#141413]">
            💌 따뜻한 익명 편지 작성하기
          </h2>

          <div>
            <label className="block text-xs font-bold text-[#141413] mb-2">
              누구에게 보내는 편지인가요?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDirection('from_manitto')}
                className={`p-3.5 rounded-2xl text-left text-xs font-bold cursor-pointer border ${
                  direction === 'from_manitto'
                    ? 'bg-[#141413] text-white border-[#141413]'
                    : 'bg-white text-[#141413] border-transparent'
                }`}
              >
                🌱 내가 챙겨주는 마니또 대상 친구에게 응원 보내기
              </button>
              <button
                type="button"
                onClick={() => setDirection('to_manitto')}
                className={`p-3.5 rounded-2xl text-left text-xs font-bold cursor-pointer border ${
                  direction === 'to_manitto'
                    ? 'bg-[#141413] text-white border-[#141413]'
                    : 'bg-white text-[#141413] border-transparent'
                }`}
              >
                💌 나를 몰래 도와주는 비밀 마니또에게 감사 답장 보내기
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1.5">
              편지 제목 (선택)
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="예: 오늘 체육 시간에 도와줘서 정말 고마웠어!"
              maxLength={120}
              className="w-full rounded-xl bg-white px-3.5 py-2.5 text-sm text-[#141413]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1.5">
              편지 내용 (따뜻한 칭찬과 응원의 말을 적어 보세요)
            </label>
            <textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="안녕! 나는 너의 마니또야. 오늘 네가 친구를 배려하는 모습을 보고 정말 감동했어..."
              required
              maxLength={1000}
              className="w-full rounded-xl bg-white p-3.5 text-sm text-[#141413]"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setBoxTab('inbox')}
              className="px-4 py-2.5 rounded-xl bg-white text-xs font-bold text-[#141413] cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={sending}
              className="px-5 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-bold cursor-pointer"
            >
              {sending ? '전송 중...' : '익명 편지 보내기'}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(boxTab === 'inbox' ? inboxLetters : sentLetters).length === 0 ? (
            <div className="col-span-2 bg-[#F3EFEA] rounded-[28px] p-8 text-center">
              <p className="text-base font-bold text-[#141413] mb-1">
                {boxTab === 'inbox' ? '아직 도착한 편지가 없어요' : '아직 보낸 편지가 없어요'}
              </p>
              <p className="text-xs text-[#6B665E] mb-4">
                먼저 마니또 친구에게 따뜻한 응원 편지를 보내 볼까요?
              </p>
              <button
                onClick={() => setBoxTab('compose')}
                className="px-4 py-2 rounded-xl bg-[#141413] text-white text-xs font-bold cursor-pointer"
              >
                첫 편지 쓰러 가기
              </button>
            </div>
          ) : (
            (boxTab === 'inbox' ? inboxLetters : sentLetters).map((letter) => {
              const isUnread = boxTab === 'inbox' && !letter.readAt;
              return (
                <div
                  key={letter.letterId}
                  onClick={() => handleOpenLetter(letter)}
                  role="button"
                  tabIndex={0}
                  className={`rounded-[24px] p-5 text-left cursor-pointer transition-transform hover:-translate-y-0.5 ${
                    isUnread ? 'bg-[#FEF08A]' : 'bg-[#F3EFEA]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-[#141413]">
                      {letter.senderDirection === 'from_manitto'
                        ? '💌 비밀 마니또가 보낸 편지'
                        : '🌱 마니또에게 보낸 감사 답장'}
                    </span>
                    <span className="bg-white rounded-xl px-2.5 py-1 text-[11px] font-bold text-[#141413]">
                      {letter.readAt ? '읽음 확인됨' : '새 편지'}
                    </span>
                  </div>

                  <h3 className="text-base font-extrabold text-[#141413] mb-1">
                    {letter.subject}
                  </h3>
                  <p className="text-xs text-[#3D3A35] line-clamp-2 leading-relaxed mb-3">
                    {letter.body}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-[#6B665E]">
                    <span>익명 보장됨</span>
                    <span className="font-bold text-[#141413]">자세히 읽기 & 답장 →</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Selected Letter Reader Modal */}
      {selectedLetter && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FEF9C3] rounded-[32px] max-w-lg w-full p-6 sm:p-8 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#854D0E]">
                {selectedLetter.senderDirection === 'from_manitto'
                  ? '💌 나를 응원하는 비밀 마니또로부터'
                  : '🌱 나의 마니또 친구로부터'}
              </span>
              <button
                onClick={() => setSelectedLetter(null)}
                className="px-3 py-1 rounded-xl bg-white text-xs font-bold text-[#141413] cursor-pointer"
              >
                닫기
              </button>
            </div>

            <h2 className="text-xl font-extrabold text-[#141413]">{selectedLetter.subject}</h2>
            <div className="bg-white rounded-2xl p-5 text-sm text-[#141413] leading-relaxed whitespace-pre-wrap">
              {selectedLetter.body}
            </div>

            <div className="flex items-center justify-between pt-2">
              {selectedLetter.receiverUid === currentStudent.uid ? (
                <button
                  onClick={() => {
                    setReportingLetter(selectedLetter);
                    setSelectedLetter(null);
                  }}
                  className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>부적절한 편지 신고</span>
                </button>
              ) : (
                <span className="text-xs text-[#6B665E]">
                  상태: {selectedLetter.readAt ? '상대방이 읽었어요 ✓' : '아직 읽지 않음'}
                </span>
              )}

              {selectedLetter.receiverUid === currentStudent.uid && (
                <button
                  onClick={() => handleReplyToSelected(selectedLetter)}
                  className="px-4 py-2 rounded-xl bg-[#141413] text-white text-xs font-bold cursor-pointer"
                >
                  답장 쓰기
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportingLetter && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleReportSubmit}
            className="bg-[#FBF9F5] rounded-[28px] max-w-md w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-extrabold text-[#141413]">부적절한 편지 신고하기</h3>
            <p className="text-xs text-[#5C574F]">
              기분이 상하거나 부적절한 표현이 있었다면 사유를 적어 주세요. 담임선생님이 확인하고 도와줄게요.
            </p>
            <textarea
              rows={3}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="신고 사유를 적어 주세요..."
              required
              className="w-full rounded-xl bg-white border border-[#E2DDD3] p-3 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportingLetter(null)}
                className="px-4 py-2 rounded-xl bg-[#EFECE6] text-xs font-bold cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
              >
                선생님께 신고 접수
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 8. REAL-TIME ANONYMOUS CLASSROOM LOUNGE VIEW
 * ========================================================================== */
/* ============================================================================
 * 8. REAL-TIME ANONYMOUS CLASSROOM LOUNGE VIEW (Auto-Presence & Viewer Count)
 * ========================================================================== */
const StudentLoungeView: React.FC<StudentContextProps> = ({
  workspaceOwnerUid,
  currentStudent,
  loungeSession,
  loungeParticipants,
  loungeMessages,
  onNotify,
}) => {
  const [messageText, setMessageText] = useState('');
  const [lastSentAt, setLastSentAt] = useState<number>(0);
  const [reportingMsg, setReportingMsg] = useState<LoungeMessage | null>(null);
  const [reportReason, setReportReason] = useState('');

  const myParticipant = loungeParticipants.find(
    (p) => p.participantUid === currentStudent.uid
  );
  const currentAlias = myParticipant?.anonymousAlias || ANONYMOUS_ALIASES[0];

  const visibleMessages = useMemo(
    () => loungeMessages.filter((m) => m.moderationStatus !== 'hidden'),
    [loungeMessages]
  );

  // Automatically register & maintain lounge presence on view mount
  useEffect(() => {
    if (!loungeSession) return;
    let isMounted = true;

    const syncLoungePresence = async () => {
      const nowIso = new Date().toISOString();
      const partRef = doc(
        db,
        'loungeSessions',
        loungeSession.sessionId,
        'participants',
        currentStudent.uid
      );

      try {
        if (!myParticipant) {
          const usedAliases = new Set(loungeParticipants.map((p) => p.anonymousAlias));
          const unusedAliases = ANONYMOUS_ALIASES.filter((a) => !usedAliases.has(a));
          const assignedAlias =
            unusedAliases.length > 0
              ? unusedAliases[Math.floor(Math.random() * unusedAliases.length)]
              : ANONYMOUS_ALIASES[Math.floor(Math.random() * ANONYMOUS_ALIASES.length)];

          await setDoc(partRef, {
            participantUid: currentStudent.uid,
            workspaceOwnerUid,
            sessionId: loungeSession.sessionId,
            anonymousAlias: assignedAlias,
            presenceStatus: 'active',
            aliasChangeCount: 0,
            joinedAt: nowIso,
            lastHeartbeatAt: nowIso,
            aliasChangedAt: nowIso,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(partRef, {
            presenceStatus: 'active',
            lastHeartbeatAt: nowIso,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (e) {
        console.error('Lounge presence sync error:', e);
      }
    };

    syncLoungePresence();

    // Heartbeat every 20 seconds
    const interval = setInterval(() => {
      if (isMounted) syncLoungePresence();
    }, 20000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [loungeSession?.sessionId, currentStudent.uid]);

  // Real-time logged-in viewers currently watching/in the lounge (active within last 3 mins)
  const liveLoungeViewers = useMemo(() => {
    const now = Date.now();
    return loungeParticipants.filter((p) => {
      if (p.presenceStatus === 'left') return false;
      if (!p.lastHeartbeatAt) return false;
      const diffMs = now - new Date(p.lastHeartbeatAt).getTime();
      return diffMs <= 3 * 60 * 1000;
    });
  }, [loungeParticipants]);

  const handleChangeAlias = async (newAlias: string) => {
    if (!loungeSession || !myParticipant) {
      onNotify('익명 프로필 정보 설정 중입니다. 잠시 후 다시 시도해 주세요.', 'info');
      return;
    }
    if (myParticipant.aliasChangeCount >= 5) {
      onNotify('사칭 및 규칙 회피 방지를 위해 별명 변경은 최대 5회까지만 가능해요.', 'error');
      return;
    }
    const elapsedSec =
      (Date.now() - new Date(myParticipant.aliasChangedAt).getTime()) / 1000;
    if (elapsedSec < 3) {
      onNotify('별명은 3초 간격으로 변경할 수 있어요.', 'info');
      return;
    }

    try {
      await updateDoc(
        doc(
          db,
          'loungeSessions',
          loungeSession.sessionId,
          'participants',
          currentStudent.uid
        ),
        {
          anonymousAlias: newAlias,
          aliasChangeCount: myParticipant.aliasChangeCount + 1,
          aliasChangedAt: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        }
      );
      onNotify(`익명 별명이 [${newAlias}](으)로 변경되었어요!`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'loungeParticipants');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loungeSession) return;
    if (loungeSession.status !== 'active') {
      onNotify('현재는 선생님의 라운지 대화 가능 시간이 아닙니다.', 'error');
      return;
    }

    const now = Date.now();
    if (now - lastSentAt < 1500) {
      onNotify('메시지를 너무 빠르게 보낼 수 없어요. 천천히 대화해 주세요.', 'info');
      return;
    }

    const cleanBody = sanitizeText(messageText, 300);
    if (!cleanBody) return;

    const bad = containsProfanity(cleanBody);
    if (bad) {
      onNotify('고운 말만 사용할 수 있어요! 비속어나 상처 주는 말은 전송되지 않습니다.', 'error');
      return;
    }

    const msgId = `lmsg_${currentStudent.uid.slice(-6)}_${now}`;
    try {
      await setDoc(doc(db, 'loungeMessages', msgId), {
        messageId: msgId,
        workspaceOwnerUid,
        sessionId: loungeSession.sessionId,
        classId: currentStudent.classId,
        senderUid: currentStudent.uid,
        anonymousAlias: currentAlias,
        body: cleanBody,
        moderationStatus: 'normal',
        hiddenAt: '',
        hiddenBy: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setMessageText('');
      setLastSentAt(now);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `loungeMessages/${msgId}`);
    }
  };

  const handleReportMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingMsg) return;
    try {
      await submitSafetyReport({
        workspaceOwnerUid,
        classId: currentStudent.classId,
        reporterUid: currentStudent.uid,
        targetType: 'loungeMessage',
        targetId: reportingMsg.messageId,
        targetPreview: `[${reportingMsg.anonymousAlias}] ${reportingMsg.body}`,
        reason: reportReason,
      });
      setReportingMsg(null);
      setReportReason('');
      onNotify('메시지 신고가 선생님께 접수되었어요.', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : '신고 실패', 'error');
    }
  };

  if (!loungeSession) {
    return (
      <div className="bg-[#F3EFEA] rounded-[28px] p-8 text-center">
        <p className="text-base font-bold text-[#141413]">예정된 익명 학급 라운지가 없습니다.</p>
      </div>
    );
  }

  const statusLabels: Record<LoungeSession['status'], string> = {
    scheduled: '운영 예정',
    waiting: '라운지 열림',
    active: '자유 대화 진행 중',
    ended: '라운지 종료/점검 중',
  };

  return (
    <div className="space-y-6">
      {/* Header & Real-Time Viewer Counts */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#DDD5F8] rounded-[28px] p-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#3730A3] mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-[#141413] text-white text-[11px] font-extrabold">
              {statusLabels[loungeSession.status]}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              운영 일정: {loungeSession.scheduledDate} ({loungeSession.startsAt} ~ {loungeSession.endsAt})
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#141413]">
            {loungeSession.title}
          </h1>
          <p className="text-xs text-[#3D3A35] mt-1">{loungeSession.noticeRules}</p>
        </div>

        {/* Real-time Logged-in Viewers Count */}
        <div className="bg-white rounded-2xl px-5 py-3 border border-[#C9BFF3] flex items-center gap-3 shadow-xs shrink-0">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <div>
            <span className="block text-[11px] font-bold text-[#6B665E]">
              👀 현재 접속 및 열람 인원
            </span>
            <strong className="text-lg font-extrabold text-[#141413] tabular-nums">
              {liveLoungeViewers.length}명 함께 보는 중
            </strong>
          </div>
        </div>
      </div>

      {/* Alias Control & Online Viewers Bar */}
      <div className="bg-[#F3EFEA] rounded-[24px] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-bold text-[#141413]">
              나의 익명 별명: <strong className="text-indigo-700">{currentAlias}</strong>
            </span>
            <select
              value={currentAlias}
              onChange={(e) => handleChangeAlias(e.target.value)}
              className="rounded-xl bg-white border border-[#D6D1C7] px-3 py-1.5 text-xs font-bold text-[#141413]"
            >
              {ANONYMOUS_ALIASES.map((al) => (
                <option key={al} value={al}>
                  {al}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const others = ANONYMOUS_ALIASES.filter((a) => a !== currentAlias);
                const rand = others[Math.floor(Math.random() * others.length)];
                handleChangeAlias(rand);
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white text-xs font-bold text-[#141413] hover:bg-[#E7E2D8] cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>무작위 별명 변경</span>
            </button>
            <span className="text-[11px] text-[#6B665E] tabular-nums">
              (변경 횟수: {myParticipant?.aliasChangeCount ?? 0}/5회)
            </span>
          </div>
        </div>

        {/* Live Anonymous Viewers List */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#E2DDD3]">
          <span className="text-xs font-extrabold text-[#5C574F] mr-1">
            💬 실시간 라운지 열람 중인 별명 ({liveLoungeViewers.length}명):
          </span>
          {liveLoungeViewers.length === 0 ? (
            <span className="text-xs text-[#8C827A]">현재 접속 중인 다른 친구가 없습니다.</span>
          ) : (
            liveLoungeViewers.map((p) => (
              <span
                key={p.participantUid}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-all ${
                  p.participantUid === currentStudent.uid
                    ? 'bg-[#141413] text-white border-[#141413]'
                    : 'bg-white text-[#141413] border-[#E2DDD3]'
                }`}
              >
                {p.anonymousAlias} {p.participantUid === currentStudent.uid ? '(나)' : ''}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Chat Messages Container */}
      <div className="bg-[#F3EFEA] rounded-[28px] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#141413]">
            실시간 익명 대화창 (다른 친구들에게 나의 실제 이름은 보이지 않아요)
          </h2>
          <span className="text-[11px] text-[#6B665E]">
            안전한 학급 운영을 위해 선생님은 기록을 열람·관리할 수 있습니다
          </span>
        </div>

        <div className="bg-white rounded-2xl p-4 h-80 overflow-y-auto space-y-3">
          {visibleMessages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-[#6B665E]">
              아직 대화가 없어요. 따뜻한 인사로 첫 메시지를 남겨 보세요!
            </div>
          ) : (
            visibleMessages.map((msg) => {
              const isMine = msg.senderUid === currentStudent.uid;
              return (
                <div
                  key={msg.messageId}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold text-[#4A463F]">
                      {msg.anonymousAlias} {isMine ? '(나)' : ''}
                    </span>
                    {!isMine && (
                      <button
                        onClick={() => setReportingMsg(msg)}
                        className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                      >
                        신고
                      </button>
                    )}
                  </div>
                  <div
                    className={`max-w-md rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                      isMine
                        ? 'bg-[#141413] text-white'
                        : 'bg-[#F3EFEA] text-[#141413]'
                    }`}
                  >
                    {msg.body}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            disabled={loungeSession.status !== 'active'}
            placeholder={
              loungeSession.status === 'active'
                ? `[${currentAlias}] 별명으로 따뜻한 메시지를 입력해 보세요 (최대 300자)...`
                : '현재는 라운지 운영 시간이 아니어서 메시지를 보낼 수 없어요.'
            }
            maxLength={300}
            className="flex-1 rounded-2xl bg-white border border-[#E2DDD3] px-4 py-3 text-xs text-[#141413] disabled:bg-[#EFECE6]"
          />
          <button
            type="submit"
            disabled={loungeSession.status !== 'active'}
            className="px-5 py-3 rounded-2xl bg-[#141413] text-white text-xs font-bold disabled:opacity-40 cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>전송</span>
          </button>
        </form>
      </div>

      {/* Report Lounge Message Modal */}
      {reportingMsg && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleReportMessage}
            className="bg-[#FBF9F5] rounded-[28px] max-w-md w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-extrabold text-[#141413]">라운지 메시지 신고하기</h3>
            <p className="text-xs text-[#5C574F]">
              신고 대상: [{reportingMsg.anonymousAlias}] &ldquo;{reportingMsg.body}&rdquo;
            </p>
            <textarea
              rows={3}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="신고 사유를 입력해 주세요..."
              required
              className="w-full rounded-xl bg-white border border-[#E2DDD3] p-3 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportingMsg(null)}
                className="px-4 py-2 rounded-xl bg-[#EFECE6] text-xs font-bold cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
              >
                신고 접수
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 9. STUDENT SETTINGS & SAFETY GUIDE VIEW
 * ========================================================================== */
const StudentSettingsView: React.FC<StudentContextProps> = ({
  currentStudent,
  appSettings,
  onNotify,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changing) return;

    if (newPassword.trim().length < 4) {
      onNotify('새 비밀번호는 4자리 이상으로 입력해 주세요.', 'error');
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      onNotify('새 비밀번호와 비밀번호 확인이 일치하지 않아요.', 'error');
      return;
    }

    setChanging(true);
    try {
      const curHash = await hashPassword(currentPassword.trim());
      if (curHash !== currentStudent.passwordHash) {
        onNotify('현재 비밀번호가 맞지 않아요. 다시 확인해 주세요.', 'error');
        setChanging(false);
        return;
      }

      const nextHash = await hashPassword(newPassword.trim());
      await updateDoc(doc(db, 'users', currentStudent.uid), {
        passwordHash: nextHash,
        updatedAt: serverTimestamp(),
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onNotify('나의 비밀번호가 안전하게 변경되었어요! 다음 로그인부터 새 비밀번호를 사용하세요.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentStudent.uid}`);
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#6B665E] mb-1">
          나의 비밀번호 변경 및 전주신동초 개인정보 보호 안내
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141413]">
          나의 비밀번호 변경 & 마니또 안전 약속
        </h1>
      </div>

      {/* Student Password Change Card */}
      <form
        onSubmit={handleChangePassword}
        className="bg-[#C6F0DF] rounded-[28px] p-6 space-y-4"
      >
        <div>
          <h2 className="text-base font-extrabold text-[#141413]">
            🔒 나의 로그인 비밀번호 변경하기
          </h2>
          <p className="text-xs text-[#065F46] mt-0.5">
            다른 친구가 내 이름으로 들어오지 못하도록 나만의 비밀번호로 변경해 보세요. (비밀번호를 잊어버리면 선생님께 초기화를 요청할 수 있어요!)
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1">
              현재 비밀번호
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="현재 비밀번호 입력"
              required
              className="w-full rounded-xl bg-white px-3.5 py-2.5 text-xs text-[#141413]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1">
              새 비밀번호 (4자 이상)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="새 비밀번호 입력"
              required
              className="w-full rounded-xl bg-white px-3.5 py-2.5 text-xs text-[#141413]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#141413] mb-1">
              새 비밀번호 한 번 더 입력
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="새 비밀번호 확인"
              required
              className="w-full rounded-xl bg-white px-3.5 py-2.5 text-xs text-[#141413]"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={changing}
            className="px-5 py-2.5 rounded-xl bg-[#141413] text-white text-xs font-bold cursor-pointer"
          >
            {changing ? '변경 중...' : '새 비밀번호로 변경하기'}
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-[#F3EFEA] rounded-[28px] p-6 space-y-2">
          <h3 className="text-base font-extrabold text-[#141413]">
            1. 익명 라운지 및 편지함 안전 약속
          </h3>
          <p className="text-xs text-[#4A463F] whitespace-pre-line leading-relaxed">
            {appSettings?.loungeRules}
          </p>
        </div>

        <div className="bg-[#F3EFEA] rounded-[28px] p-6 space-y-2">
          <h3 className="text-base font-extrabold text-[#141413]">
            2. 프로필 공개 범위 및 개인정보 보호
          </h3>
          <p className="text-xs text-[#4A463F] leading-relaxed">
            {appSettings?.profilePolicy}
          </p>
        </div>

        <div className="bg-[#F3EFEA] rounded-[28px] p-6 space-y-2">
          <h3 className="text-base font-extrabold text-[#141413]">
            3. 선생님 안전 검토 안내
          </h3>
          <p className="text-xs text-[#4A463F] leading-relaxed">
            {appSettings?.letterModerationPolicy}
          </p>
        </div>

        <div className="bg-[#F3EFEA] rounded-[28px] p-6 space-y-2">
          <h3 className="text-base font-extrabold text-[#141413]">
            4. 나의 계정 정보 및 데이터 보존 정책
          </h3>
          <p className="text-xs text-[#4A463F] leading-relaxed mb-2">
            {appSettings?.dataRetentionPolicy}
          </p>
          <p className="text-xs font-bold text-[#141413]">
            현재 로그인 학생: {currentStudent.displayName} ({currentStudent.studentLoginId})
          </p>
        </div>
      </div>
    </div>
  );
};
