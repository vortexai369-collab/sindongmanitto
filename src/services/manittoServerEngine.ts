import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
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
  ReportRecord,
  AuditLog,
  AppSetting,
} from '../types/manitto';
import {
  getInitialMissions,
  getInitialBadges,
  getInitialClassroom,
  getInitialAppSettings,
  getInitialUsers,
  getInitialAssignments,
  DEFAULT_PASSWORD_HASH_1234,
} from '../data/seedData';

// SHA-256 Hashing in Browser (Web Crypto API) so plaintext passwords are never stored in Firestore
export async function hashPassword(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function sanitizeText(input: string, maxLength: number): string {
  return input
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

const BAD_WORDS = ['바보', '멍청이', '짜증나', '싫어해', '미워', '죽어', '꺼져', '씨발', '병신'];

export function containsProfanity(text: string): string | null {
  const normalized = text.replace(/\s+/g, '');
  for (const word of BAD_WORDS) {
    if (normalized.includes(word)) {
      return word;
    }
  }
  return null;
}

export function isUserCurrentlyOnline(user: UserProfile): boolean {
  if (!user.isOnlineSession || !user.lastHeartbeatAt) return false;
  const diffMs = Date.now() - new Date(user.lastHeartbeatAt).getTime();
  // Active within the last 5 minutes
  return diffMs <= 5 * 60 * 1000;
}

function getDateDaysAgo(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Helper: Queries existing document IDs in a collection for this workspace
 * and only creates documents that do not yet exist (preventing update timestamp rule conflicts
 * and recovering cleanly from any previously interrupted partial seed).
 */
async function seedCollectionIfMissing(
  colName: string,
  workspaceOwnerUid: string,
  docsToSeed: Array<{ id: string; data: Record<string, unknown> }>
): Promise<void> {
  if (docsToSeed.length === 0) return;
  const q = query(
    collection(db, colName),
    where('workspaceOwnerUid', '==', workspaceOwnerUid)
  );
  const snap = await getDocs(q);
  const existingIds = new Set(snap.docs.map((d) => d.id));
  const missing = docsToSeed.filter((item) => !existingIds.has(item.id));
  if (missing.length === 0) return;

  await Promise.all(
    missing.map((item) => setDoc(doc(db, colName, item.id), item.data))
  );
}

/**
 * Seeds the initial Jeonju Shindong Elementary 5-2 Classroom workspace if not yet initialized.
 * Safe against partial/interrupted runs and executes in fast parallel batches.
 */
export async function ensureWorkspaceSeeded(workspaceOwnerUid: string): Promise<void> {
  const prefix = workspaceOwnerUid.slice(0, 8);
  const scopedClassId = `class_${prefix}_5_2`;

  try {
    // Quick check: if users, missions, and badges are all populated, skip full seed
    const [usersSnap, missionsSnap, badgesSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('workspaceOwnerUid', '==', workspaceOwnerUid))),
      getDocs(query(collection(db, 'missions'), where('workspaceOwnerUid', '==', workspaceOwnerUid))),
      getDocs(query(collection(db, 'badges'), where('workspaceOwnerUid', '==', workspaceOwnerUid))),
    ]);

    if (usersSnap.size >= 2 && missionsSnap.size >= 20 && badgesSnap.size >= 5) {
      return;
    }

    // 1. Seed Users FIRST (1 Teacher + 6 Students) so Login Roster renders immediately
    const users = getInitialUsers(workspaceOwnerUid);
    await seedCollectionIfMissing(
      'users',
      workspaceOwnerUid,
      users.map((u) => {
        const uId = `${prefix}_${u.uid}`;
        return {
          id: uId,
          data: {
            ...u,
            uid: uId,
            classId: scopedClassId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        };
      })
    );

    // 2. Seed Classroom & App Settings
    const baseClass = getInitialClassroom(workspaceOwnerUid);
    const settingsId = `settings_${prefix}`;
    const baseSettings = getInitialAppSettings(workspaceOwnerUid);

    await Promise.all([
      seedCollectionIfMissing('classes', workspaceOwnerUid, [
        {
          id: scopedClassId,
          data: {
            ...baseClass,
            classId: scopedClassId,
            teacherUids: [`${prefix}_teacher_main`],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        },
      ]),
      seedCollectionIfMissing('appSettings', workspaceOwnerUid, [
        {
          id: settingsId,
          data: {
            ...baseSettings,
            settingId: settingsId,
            updatedBy: `${prefix}_teacher_main`,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        },
      ]),
    ]);

    // 3. Seed Missions (20) & Badges (5) in parallel
    const missions = getInitialMissions(workspaceOwnerUid);
    const badges = getInitialBadges(workspaceOwnerUid);

    await Promise.all([
      seedCollectionIfMissing(
        'missions',
        workspaceOwnerUid,
        missions.map((m) => {
          const mId = `${prefix}_${m.missionId}`;
          return {
            id: mId,
            data: {
              ...m,
              missionId: mId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
          };
        })
      ),
      seedCollectionIfMissing(
        'badges',
        workspaceOwnerUid,
        badges.map((b) => {
          const bId = `${prefix}_${b.badgeId}`;
          return {
            id: bId,
            data: {
              ...b,
              badgeId: bId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
          };
        })
      ),
    ]);

    // 4. Seed Manitto Assignments & Letter Threads
    const assignments = getInitialAssignments(workspaceOwnerUid);
    await Promise.all([
      seedCollectionIfMissing(
        'manittoAssignments',
        workspaceOwnerUid,
        assignments.map((a) => {
          const aId = `${prefix}_${a.assignmentId}`;
          return {
            id: aId,
            data: {
              ...a,
              assignmentId: aId,
              classId: scopedClassId,
              giverUid: `${prefix}_${a.giverUid}`,
              receiverUid: `${prefix}_${a.receiverUid}`,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
          };
        })
      ),
      seedCollectionIfMissing(
        'letterThreads',
        workspaceOwnerUid,
        assignments.map((a) => {
          const aId = `${prefix}_${a.assignmentId}`;
          const threadId = `${prefix}_thread_${a.assignmentId}`;
          return {
            id: threadId,
            data: {
              threadId,
              workspaceOwnerUid,
              classId: scopedClassId,
              assignmentId: aId,
              participantUids: [`${prefix}_${a.giverUid}`, `${prefix}_${a.receiverUid}`],
              lastMessageAt: new Date().toISOString(),
              status: 'active',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
          };
        })
      ),
    ]);

    // 5. Initial Mission Submissions, Score Ledger, Badge Awards, and Student Stats
    const initialSubmissions: Array<{
      subKey: string;
      studentShort: string;
      missionShort: string;
      action: string;
      reflection: string;
      daysAgo: number;
      status: 'approved' | 'pending';
      points: number;
    }> = [
      {
        subKey: 'sub_01',
        studentShort: 'student_01',
        missionShort: 'mission_01',
        action: '아침에 등교해서 마니또 친구와 짝꿍에게 먼저 눈을 맞추며 밝게 인사했어요!',
        reflection: '친구도 환하게 웃으며 인사를 받아주어서 아침 기분이 정말 상쾌했어요.',
        daysAgo: 4,
        status: 'approved',
        points: 5,
      },
      {
        subKey: 'sub_02',
        studentShort: 'student_01',
        missionShort: 'mission_02',
        action: '체육 시간에 이준서 친구가 넘어진 친구를 일으켜 세워주는 멋진 장점을 발견했어요.',
        reflection: '친구의 배려심 깊은 모습을 보면서 나도 더 친절해져야겠다고 생각했어요.',
        daysAgo: 3,
        status: 'approved',
        points: 5,
      },
      {
        subKey: 'sub_03',
        studentShort: 'student_01',
        missionShort: 'mission_04',
        action: '미술 시간에 물통을 나르는 친구가 무거워 보여서 함께 들어주었어요.',
        reflection: '함께 드니까 훨씬 가볍고 친구가 고맙다고 해줘서 뿌듯했어요.',
        daysAgo: 2,
        status: 'approved',
        points: 10,
      },
      {
        subKey: 'sub_04',
        studentShort: 'student_01',
        missionShort: 'mission_07',
        action: '마니또에게 오늘 발표 정말 멋졌다고 응원하는 익명 편지를 보냈어요.',
        reflection: '누군가를 몰래 응원하는 일이 이렇게 설레고 즐거운지 알게 되었어요.',
        daysAgo: 1,
        status: 'approved',
        points: 10,
      },
      {
        subKey: 'sub_05',
        studentShort: 'student_01',
        missionShort: 'mission_14',
        action: '사회 모둠 프로젝트에서 친구들과 역할을 나누어 신동초 역사 신문을 완성했어요.',
        reflection: '서로 양보하고 도와주니 혼자 할 때보다 훨씬 멋진 작품이 나왔어요!',
        daysAgo: 0,
        status: 'pending',
        points: 15,
      },
      {
        subKey: 'sub_06',
        studentShort: 'student_02',
        missionShort: 'mission_01',
        action: '교실에 들어오면서 친구들에게 큰 소리로 좋은 아침이라고 인사했어요.',
        reflection: '교실 분위기가 밝아져서 기분이 좋았어요.',
        daysAgo: 3,
        status: 'approved',
        points: 5,
      },
      {
        subKey: 'sub_07',
        studentShort: 'student_02',
        missionShort: 'mission_09',
        action: '점심시간 뒤에 교실 뒷자리 사물함 위와 학급 문고를 친구와 함께 정리했어요.',
        reflection: '깨끗해진 교실을 보니 마음이 뿌듯했어요.',
        daysAgo: 1,
        status: 'approved',
        points: 10,
      },
      {
        subKey: 'sub_08',
        studentShort: 'student_03',
        missionShort: 'mission_03',
        action: '음악 시간에 리코더 연습을 열심히 한 친구에게 소리가 정말 고왔다고 칭찬했어요.',
        reflection: '칭찬을 들은 친구가 부끄러워하면서도 좋아하는 모습에 나도 행복했어요.',
        daysAgo: 2,
        status: 'approved',
        points: 10,
      },
      {
        subKey: 'sub_09',
        studentShort: 'student_03',
        missionShort: 'mission_16',
        action: '쉬는 시간에 칠판을 깨끗이 지우고 떨어진 분필 가루를 정리했어요.',
        reflection: '다음 수업 시간에 선생님과 친구들이 기분 좋게 수업을 시작할 수 있었어요.',
        daysAgo: 0,
        status: 'pending',
        points: 15,
      },
      {
        subKey: 'sub_10',
        studentShort: 'student_04',
        missionShort: 'mission_05',
        action: '쉬는 시간에 고민이 있는 친구의 이야기를 끝까지 고개를 끄덕이며 들어주었어요.',
        reflection: '들어주기만 했는데도 친구 표정이 밝아져서 다행이었어요.',
        daysAgo: 2,
        status: 'approved',
        points: 10,
      },
      {
        subKey: 'sub_11',
        studentShort: 'student_05',
        missionShort: 'mission_06',
        action: '색연필을 빌려준 친구에게 진심을 담아 고맙다고 이야기했어요.',
        reflection: '고마운 마음을 말로 표현하니 친구 사이가 더 가까워진 느낌이에요.',
        daysAgo: 1,
        status: 'approved',
        points: 5,
      },
      {
        subKey: 'sub_12',
        studentShort: 'student_06',
        missionShort: 'mission_04',
        action: '교실 창가 화분에 물을 주는 당번 친구를 도와 함께 물을 주었어요.',
        reflection: '식물도 싱그러워지고 친구와도 친해져서 좋았어요.',
        daysAgo: 1,
        status: 'approved',
        points: 10,
      },
    ];

    const pointsPerStudent: Record<string, { points: number; count: number }> = {
      student_01: { points: 0, count: 0 },
      student_02: { points: 0, count: 0 },
      student_03: { points: 0, count: 0 },
      student_04: { points: 0, count: 0 },
      student_05: { points: 0, count: 0 },
      student_06: { points: 0, count: 0 },
    };

    const subDocsToSeed: Array<{ id: string; data: Record<string, unknown> }> = [];
    const ledgerDocsToSeed: Array<{ id: string; data: Record<string, unknown> }> = [];

    for (const item of initialSubmissions) {
      const subId = `${prefix}_${item.subKey}`;
      const studentUid = `${prefix}_${item.studentShort}`;
      const missionId = `${prefix}_${item.missionShort}`;
      const actDate = getDateDaysAgo(item.daysAgo);
      const isApproved = item.status === 'approved';

      subDocsToSeed.push({
        id: subId,
        data: {
          submissionId: subId,
          workspaceOwnerUid,
          missionId,
          studentUid,
          classId: scopedClassId,
          actionDescription: item.action,
          reflection: item.reflection,
          activityDate: actDate,
          evidenceNote: '교실 실천 기록 확인',
          status: item.status,
          awardedPoints: isApproved ? item.points : 0,
          reviewedBy: isApproved ? `${prefix}_teacher_main` : '',
          reviewedAt: isApproved ? new Date().toISOString() : '',
          reviewComment: isApproved ? '참 잘했어요! 따뜻한 배려가 돋보여요.' : '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });

      if (isApproved) {
        pointsPerStudent[item.studentShort].points += item.points;
        pointsPerStudent[item.studentShort].count += 1;

        const ledgerId = `${prefix}_ledger_${item.subKey}`;
        ledgerDocsToSeed.push({
          id: ledgerId,
          data: {
            ledgerId,
            workspaceOwnerUid,
            studentUid,
            classId: scopedClassId,
            sourceType: 'mission',
            sourceId: subId,
            pointsDelta: item.points,
            activityDate: actDate,
            reason: `미션 달성 보상 (${item.missionShort})`,
            createdBy: `${prefix}_teacher_main`,
            reversalOf: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        });
      }
    }

    const firstAwardId = `${prefix}_award_s01_b01`;
    const statsDocsToSeed = Object.keys(pointsPerStudent).map((sKey) => {
      const sUid = `${prefix}_${sKey}`;
      const badgeCount = sKey === 'student_01' ? 1 : 0;
      return {
        id: sUid,
        data: {
          studentUid: sUid,
          workspaceOwnerUid,
          classId: scopedClassId,
          totalPoints: pointsPerStudent[sKey].points,
          completedMissionCount: pointsPerStudent[sKey].count,
          earnedBadgeCount: badgeCount,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      };
    });

    await Promise.all([
      seedCollectionIfMissing('missionSubmissions', workspaceOwnerUid, subDocsToSeed),
      seedCollectionIfMissing('scoreLedger', workspaceOwnerUid, ledgerDocsToSeed),
      seedCollectionIfMissing('badgeAwards', workspaceOwnerUid, [
        {
          id: firstAwardId,
          data: {
            awardId: firstAwardId,
            workspaceOwnerUid,
            studentUid: `${prefix}_student_01`,
            badgeId: `${prefix}_badge_01_sprout`,
            classId: scopedClassId,
            awardedAt: getDateDaysAgo(4),
            criteriaSnapshot: '첫 번째 미션 완료 달성',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        },
      ]),
      seedCollectionIfMissing('studentStats', workspaceOwnerUid, statsDocsToSeed),
    ]);

    // 6. Sample Anonymous Letters, Active Lounge Session, Messages, and Audit Log
    const letter1Id = `${prefix}_letter_01`;
    const letter2Id = `${prefix}_letter_02`;
    const sessionId = `${prefix}_lounge_today`;
    const todayStr = new Date().toISOString().slice(0, 10);
    const p1Uid = `${prefix}_student_01`;
    const p2Uid = `${prefix}_student_02`;
    const p3Uid = `${prefix}_student_03`;
    const p6Uid = `${prefix}_student_06`;
    const msg1Id = `${prefix}_lmsg_01`;
    const msg2Id = `${prefix}_lmsg_02`;
    const log1Id = `${prefix}_audit_init`;

    await Promise.all([
      seedCollectionIfMissing('letters', workspaceOwnerUid, [
        {
          id: letter1Id,
          data: {
            letterId: letter1Id,
            workspaceOwnerUid,
            threadId: `${prefix}_thread_assign_06`,
            classId: scopedClassId,
            senderUid: `${prefix}_student_06`,
            receiverUid: `${prefix}_student_01`,
            senderDirection: 'from_manitto',
            subject: '하늘아! 오늘 미술 시간에 그림 정말 멋졌어 🎨',
            body: '안녕! 나는 너를 몰래 응원하는 마니또야. 오늘 미술 시간에 네가 그린 가을 풍경 그림이 정말 따뜻하고 예뻐서 깜짝 놀랐어. 또 짝꿍에게 지우개를 친절하게 빌려주는 모습도 정말 보기 좋았어! 내일도 즐거운 하루 보내길 응원할게!',
            readAt: '',
            moderationStatus: 'normal',
            deletedAt: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        },
        {
          id: letter2Id,
          data: {
            letterId: letter2Id,
            workspaceOwnerUid,
            threadId: `${prefix}_thread_assign_01`,
            classId: scopedClassId,
            senderUid: `${prefix}_student_01`,
            receiverUid: `${prefix}_student_02`,
            senderDirection: 'from_manitto',
            subject: '언제나 활기찬 내 마니또 친구에게 보내는 응원 편지!',
            body: '안녕! 체육 시간에 피구할 때 친구들을 배려하면서 멋지게 패스하는 모습을 봤어. 네 덕분에 우리 반이 항상 활기차고 즐거워! 앞으로도 내가 뒤에서 열심히 응원할게 화이팅!',
            readAt: new Date().toISOString(),
            moderationStatus: 'normal',
            deletedAt: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        },
      ]),
      seedCollectionIfMissing('loungeSessions', workspaceOwnerUid, [
        {
          id: sessionId,
          data: {
            sessionId,
            workspaceOwnerUid,
            classId: scopedClassId,
            title: '5학년 2반 금요일 칭찬 & 마니또 힌트 라운지',
            noticeRules:
              '고운 말과 따뜻한 칭찬만 나누어요! 실명이나 마니또 정체를 직접 밝히지 말고 따뜻한 힌트와 고마움을 나누어 보세요.',
            scheduledDate: todayStr,
            startsAt: '08:30',
            endsAt: '22:00',
            status: 'active',
            waitingCount: 1,
            participantCount: 3,
            createdBy: `${prefix}_teacher_main`,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        },
      ]),
      seedCollectionIfMissing('loungeMessages', workspaceOwnerUid, [
        {
          id: msg1Id,
          data: {
            messageId: msg1Id,
            workspaceOwnerUid,
            sessionId,
            classId: scopedClassId,
            senderUid: p2Uid,
            anonymousAlias: '초록빛 다람쥐',
            body: '오늘 사물함에 응원 편지 남겨준 내 마니또 정말 고마워! 읽고 기분이 너무 좋았어 😊',
            moderationStatus: 'normal',
            hiddenAt: '',
            hiddenBy: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        },
        {
          id: msg2Id,
          data: {
            messageId: msg2Id,
            workspaceOwnerUid,
            sessionId,
            classId: scopedClassId,
            senderUid: p3Uid,
            anonymousAlias: '민트색 고양이',
            body: '우리 반 친구들 오늘 체육 시간 피구할 때 서로 양보하는 모습 진짜 멋졌어!',
            moderationStatus: 'normal',
            hiddenAt: '',
            hiddenBy: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        },
      ]),
      seedCollectionIfMissing('auditLogs', workspaceOwnerUid, [
        {
          id: log1Id,
          data: {
            logId: log1Id,
            workspaceOwnerUid,
            actorUid: `${prefix}_teacher_main`,
            actorName: '김신동 선생님',
            action: 'CLASSROOM_INITIALIZED',
            targetType: 'class',
            targetId: scopedClassId,
            reason: '전주신동초 5학년 2반 마니또 학기 운영 초기화 및 기본 미션 20종 설정',
            metadataSummary: '학생 6명, 마니또 배정 6건, 기본 미션 20개, 뱃지 5종 생성 완료',
            createdAt: serverTimestamp(),
          },
        },
      ]),
    ]);

    // 7. Seed Lounge Participants subcollection if missing
    const partPath = `loungeSessions/${sessionId}/participants`;
    const partSnap = await getDocs(
      query(collection(db, partPath), where('workspaceOwnerUid', '==', workspaceOwnerUid))
    );
    const existingPartIds = new Set(partSnap.docs.map((d) => d.id));
    const initialParts = [
      { uid: p1Uid, alias: '구름 위 토끼', status: 'active' },
      { uid: p2Uid, alias: '초록빛 다람쥐', status: 'active' },
      { uid: p3Uid, alias: '민트색 고양이', status: 'active' },
      { uid: p6Uid, alias: '별똥별 여우', status: 'waiting' },
    ].filter((p) => !existingPartIds.has(p.uid));

    if (initialParts.length > 0) {
      const nowIso = new Date().toISOString();
      await Promise.all(
        initialParts.map((p) =>
          setDoc(doc(db, 'loungeSessions', sessionId, 'participants', p.uid), {
            participantUid: p.uid,
            workspaceOwnerUid,
            sessionId,
            anonymousAlias: p.alias,
            presenceStatus: p.status,
            aliasChangeCount: 0,
            joinedAt: nowIso,
            lastHeartbeatAt: nowIso,
            aliasChangedAt: nowIso,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        )
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'workspaceSeed');
  }
}

/**
 * Resets a student's password to the default '1234'
 */
export async function resetStudentPasswordTo1234(params: {
  workspaceOwnerUid: string;
  teacherUid: string;
  teacherName: string;
  student: UserProfile;
}): Promise<void> {
  const { workspaceOwnerUid, teacherUid, teacherName, student } = params;
  try {
    const pwHash = DEFAULT_PASSWORD_HASH_1234;
    await updateDoc(doc(db, 'users', student.uid), {
      passwordHash: pwHash,
      updatedAt: serverTimestamp(),
    });

    await recordAuditLog({
      workspaceOwnerUid,
      actorUid: teacherUid,
      actorName: teacherName,
      action: 'PASSWORD_RESET',
      targetType: 'user',
      targetId: student.uid,
      reason: '교사 관리자에 의한 초기 비밀번호(1234) 즉시 초기화',
      metadataSummary: `${student.displayName} (${student.studentLoginId}) 비밀번호가 1234로 초기화됨`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${student.uid}`);
  }
}

/**
 * Batch registers multiple students at once
 */
export async function createStudentsBatch(params: {
  workspaceOwnerUid: string;
  teacherUid: string;
  teacherName: string;
  classId: string;
  students: Array<{ displayName: string; studentLoginId: string; avatarId?: string }>;
}): Promise<{ count: number }> {
  const { workspaceOwnerUid, teacherUid, teacherName, classId, students } = params;
  const prefix = workspaceOwnerUid.slice(0, 8);
  const nowIso = new Date().toISOString();
  const defaultPw = DEFAULT_PASSWORD_HASH_1234;

  const userWrites = students.map((stu, index) => {
    const uid = `${prefix}_stu_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`;
    const avatar = stu.avatarId || 'rabbit';
    const cleanName = sanitizeText(stu.displayName, 60);
    const cleanLoginId = sanitizeText(stu.studentLoginId, 64);

    const userDocPromise = setDoc(doc(db, 'users', uid), {
      uid,
      workspaceOwnerUid,
      role: 'student',
      studentLoginId: cleanLoginId,
      passwordHash: defaultPw,
      displayName: cleanName,
      classId,
      avatarId: avatar,
      bio: '전주신동초 마니또 친구예요!',
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

    const statDocPromise = setDoc(doc(db, 'studentStats', uid), {
      studentUid: uid,
      workspaceOwnerUid,
      classId,
      totalPoints: 0,
      completedMissionCount: 0,
      earnedBadgeCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return Promise.all([userDocPromise, statDocPromise]);
  });

  await Promise.all(userWrites);

  await recordAuditLog({
    workspaceOwnerUid,
    actorUid: teacherUid,
    actorName: teacherName,
    action: 'STUDENTS_BATCH_CREATED',
    targetType: 'users',
    targetId: `${students.length}_students`,
    reason: `학생 ${students.length}명 일괄 명단 등록`,
    metadataSummary: students.map((s) => s.displayName).join(', ').slice(0, 380),
  });

  return { count: students.length };
}

/**
 * Batch deletes multiple students from Firestore with FULL CASCADE DELETION
 * of their mission submissions, score ledger entries, badge awards,
 * manitto assignments, letters, and lounge messages.
 */
export async function deleteStudentsBatch(params: {
  workspaceOwnerUid: string;
  teacherUid: string;
  teacherName: string;
  students: UserProfile[];
}): Promise<{ count: number }> {
  const { workspaceOwnerUid, teacherUid, teacherName, students } = params;
  if (students.length === 0) return { count: 0 };

  const targetUids = new Set(students.map((s) => s.uid));

  // 1. Delete users & studentStats
  const directDeletes = students.map(async (stu) => {
    try {
      await deleteDoc(doc(db, 'users', stu.uid));
    } catch {
      // Ignore if absent
    }
    try {
      await deleteDoc(doc(db, 'studentStats', stu.uid));
    } catch {
      // Ignore if absent
    }
  });

  // 2. Cascade delete mission submissions
  const subSnap = await getDocs(
    query(collection(db, 'missionSubmissions'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  const subDeletes = subSnap.docs
    .filter((d) => targetUids.has(d.data().studentUid))
    .map((d) => deleteDoc(doc(db, 'missionSubmissions', d.id)));

  // 3. Cascade delete score ledger
  const ledgerSnap = await getDocs(
    query(collection(db, 'scoreLedger'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  const ledgerDeletes = ledgerSnap.docs
    .filter((d) => targetUids.has(d.data().studentUid))
    .map((d) => deleteDoc(doc(db, 'scoreLedger', d.id)));

  // 4. Cascade delete badge awards
  const awardSnap = await getDocs(
    query(collection(db, 'badgeAwards'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  const awardDeletes = awardSnap.docs
    .filter((d) => targetUids.has(d.data().studentUid))
    .map((d) => deleteDoc(doc(db, 'badgeAwards', d.id)));

  // 5. Cascade delete manitto assignments
  const assignSnap = await getDocs(
    query(collection(db, 'manittoAssignments'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  const assignDeletes = assignSnap.docs
    .filter((d) => targetUids.has(d.data().giverUid) || targetUids.has(d.data().receiverUid))
    .map((d) => deleteDoc(doc(db, 'manittoAssignments', d.id)));

  // 6. Cascade delete letters
  const letterSnap = await getDocs(
    query(collection(db, 'letters'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  const letterDeletes = letterSnap.docs
    .filter((d) => targetUids.has(d.data().senderUid) || targetUids.has(d.data().receiverUid))
    .map((d) => deleteDoc(doc(db, 'letters', d.id)));

  // 7. Cascade delete lounge messages
  const msgSnap = await getDocs(
    query(collection(db, 'loungeMessages'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  const msgDeletes = msgSnap.docs
    .filter((d) => targetUids.has(d.data().senderUid))
    .map((d) => deleteDoc(doc(db, 'loungeMessages', d.id)));

  await Promise.all([
    ...directDeletes,
    ...subDeletes,
    ...ledgerDeletes,
    ...awardDeletes,
    ...assignDeletes,
    ...letterDeletes,
    ...msgDeletes,
  ]);

  await recordAuditLog({
    workspaceOwnerUid,
    actorUid: teacherUid,
    actorName: teacherName,
    action: 'STUDENTS_CASCADE_DELETED',
    targetType: 'users',
    targetId: `${students.length}_students`,
    reason: `교사 요청에 의한 학생 ${students.length}명 및 연계 활동 데이터(미션, 원장, 편지, 마니또 배정) 영구 삭제`,
    metadataSummary: students.map((s) => s.displayName).join(', ').slice(0, 380),
  });

  return { count: students.length };
}

/**
 * Cleans up orphaned activity records whose studentUid or participantUid no longer exists in users
 */
export async function cleanupOrphanedActivityData(params: {
  workspaceOwnerUid: string;
  teacherUid: string;
  teacherName: string;
}): Promise<{ cleanedCount: number }> {
  const { workspaceOwnerUid, teacherUid, teacherName } = params;

  // 1. Get all current user UIDs
  const usersSnap = await getDocs(
    query(collection(db, 'users'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  const activeUids = new Set(usersSnap.docs.map((d) => d.data().uid));

  let cleaned = 0;

  // 2. Cleanup orphaned missionSubmissions
  const subSnap = await getDocs(
    query(collection(db, 'missionSubmissions'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  const deadSubs = subSnap.docs.filter((d) => !activeUids.has(d.data().studentUid));
  cleaned += deadSubs.length;
  await Promise.all(deadSubs.map((d) => deleteDoc(doc(db, 'missionSubmissions', d.id))));

  // 3. Cleanup orphaned scoreLedger
  const ledgerSnap = await getDocs(
    query(collection(db, 'scoreLedger'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  const deadLedgers = ledgerSnap.docs.filter((d) => !activeUids.has(d.data().studentUid));
  cleaned += deadLedgers.length;
  await Promise.all(deadLedgers.map((d) => deleteDoc(doc(db, 'scoreLedger', d.id))));

  // 4. Cleanup orphaned badgeAwards
  const awardSnap = await getDocs(
    query(collection(db, 'badgeAwards'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  const deadAwards = awardSnap.docs.filter((d) => !activeUids.has(d.data().studentUid));
  cleaned += deadAwards.length;
  await Promise.all(deadAwards.map((d) => deleteDoc(doc(db, 'badgeAwards', d.id))));

  // 5. Cleanup orphaned manittoAssignments
  const assignSnap = await getDocs(
    query(collection(db, 'manittoAssignments'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  const deadAssigns = assignSnap.docs.filter(
    (d) => !activeUids.has(d.data().giverUid) || !activeUids.has(d.data().receiverUid)
  );
  cleaned += deadAssigns.length;
  await Promise.all(deadAssigns.map((d) => deleteDoc(doc(db, 'manittoAssignments', d.id))));

  // 6. Cleanup orphaned letters
  const letterSnap = await getDocs(
    query(collection(db, 'letters'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  const deadLetters = letterSnap.docs.filter(
    (d) => !activeUids.has(d.data().senderUid) || !activeUids.has(d.data().receiverUid)
  );
  cleaned += deadLetters.length;
  await Promise.all(deadLetters.map((d) => deleteDoc(doc(db, 'letters', d.id))));

  // 7. Cleanup orphaned loungeMessages
  const msgSnap = await getDocs(
    query(collection(db, 'loungeMessages'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  const deadMsgs = msgSnap.docs.filter((d) => !activeUids.has(d.data().senderUid));
  cleaned += deadMsgs.length;
  await Promise.all(deadMsgs.map((d) => deleteDoc(doc(db, 'loungeMessages', d.id))));

  await recordAuditLog({
    workspaceOwnerUid,
    actorUid: teacherUid,
    actorName: teacherName,
    action: 'ORPHANED_DATA_CLEANED',
    targetType: 'classroomActivities',
    targetId: 'all',
    reason: '학생 없는 고아 활동 데이터 자동 정리 완료',
    metadataSummary: `총 ${cleaned}건의 고아 활동 기록 삭제`,
  });

  return { cleanedCount: cleaned };
}

/**
 * Completely resets all classroom activity records back to zero for the current students
 */
export async function resetAllClassroomActivities(params: {
  workspaceOwnerUid: string;
  teacherUid: string;
  teacherName: string;
}): Promise<void> {
  const { workspaceOwnerUid, teacherUid, teacherName } = params;

  // 1. Delete all missionSubmissions
  const subSnap = await getDocs(
    query(collection(db, 'missionSubmissions'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  await Promise.all(subSnap.docs.map((d) => deleteDoc(doc(db, 'missionSubmissions', d.id))));

  // 2. Delete all scoreLedger
  const ledgerSnap = await getDocs(
    query(collection(db, 'scoreLedger'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  await Promise.all(ledgerSnap.docs.map((d) => deleteDoc(doc(db, 'scoreLedger', d.id))));

  // 3. Delete all badgeAwards
  const awardSnap = await getDocs(
    query(collection(db, 'badgeAwards'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  await Promise.all(awardSnap.docs.map((d) => deleteDoc(doc(db, 'badgeAwards', d.id))));

  // 4. Delete all letters
  const letterSnap = await getDocs(
    query(collection(db, 'letters'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  await Promise.all(letterSnap.docs.map((d) => deleteDoc(doc(db, 'letters', d.id))));

  // 5. Delete all loungeMessages
  const msgSnap = await getDocs(
    query(collection(db, 'loungeMessages'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  await Promise.all(msgSnap.docs.map((d) => deleteDoc(doc(db, 'loungeMessages', d.id))));

  // 6. Reset all studentStats back to 0
  const statsSnap = await getDocs(
    query(collection(db, 'studentStats'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  await Promise.all(
    statsSnap.docs.map((d) =>
      updateDoc(doc(db, 'studentStats', d.id), {
        totalPoints: 0,
        completedMissionCount: 0,
        earnedBadgeCount: 0,
        updatedAt: serverTimestamp(),
      })
    )
  );

  await recordAuditLog({
    workspaceOwnerUid,
    actorUid: teacherUid,
    actorName: teacherName,
    action: 'CLASSROOM_ACTIVITIES_RESET',
    targetType: 'classroomActivities',
    targetId: 'all',
    reason: '교사 관리자에 의한 학급 전체 마니또 활동 기록 초기화 (점수, 미션, 편지 0으로 리셋)',
    metadataSummary: '미션, 점수원장, 뱃지, 편지, 라운지 메시지 전체 초기화 완료',
  });
}

/**
 * Updates classroom name and school name in Firestore classes collection
 */
export async function updateClassroomInfo(params: {
  workspaceOwnerUid: string;
  teacherUid: string;
  teacherName: string;
  className: string;
  schoolName: string;
}): Promise<void> {
  const { workspaceOwnerUid, teacherUid, teacherName, className, schoolName } = params;
  const cleanClassName = sanitizeText(className, 80) || '5학년 2반';
  const cleanSchoolName = sanitizeText(schoolName, 80) || '전주신동초등학교';

  const classSnap = await getDocs(
    query(collection(db, 'classes'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );

  if (!classSnap.empty) {
    await Promise.all(
      classSnap.docs.map((d) =>
        updateDoc(doc(db, 'classes', d.id), {
          name: cleanClassName,
          schoolName: cleanSchoolName,
          updatedAt: serverTimestamp(),
        })
      )
    );
  } else {
    const prefix = workspaceOwnerUid.slice(0, 8);
    const targetClassId = `${prefix}_class_5_2`;
    await setDoc(doc(db, 'classes', targetClassId), {
      classId: targetClassId,
      workspaceOwnerUid,
      name: cleanClassName,
      schoolName: cleanSchoolName,
      teacherUids: [teacherUid],
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  await recordAuditLog({
    workspaceOwnerUid,
    actorUid: teacherUid,
    actorName: teacherName,
    action: 'CLASSROOM_INFO_UPDATED',
    targetType: 'classes',
    targetId: 'main',
    reason: `학급 명칭("${cleanClassName}") 및 학교명("${cleanSchoolName}") 수정`,
    metadataSummary: `className: ${cleanClassName}, schoolName: ${cleanSchoolName}`,
  });
}

/**
 * Updates teacher profile name, avatar, bio, and classroom name
 */
export async function updateTeacherProfile(params: {
  workspaceOwnerUid: string;
  teacherUid: string;
  displayName: string;
  avatarId: string;
  bio: string;
  classId?: string;
  className?: string;
  schoolName?: string;
}): Promise<void> {
  const { workspaceOwnerUid, teacherUid, displayName, avatarId, bio, classId, className, schoolName } = params;

  const userUpdates: Record<string, unknown> = {
    displayName: sanitizeText(displayName, 60),
    avatarId,
    bio: sanitizeText(bio, 300),
    updatedAt: serverTimestamp(),
  };
  if (classId) {
    userUpdates.classId = sanitizeText(classId, 40);
  }

  await updateDoc(doc(db, 'users', teacherUid), userUpdates);

  if (className || schoolName) {
    await updateClassroomInfo({
      workspaceOwnerUid,
      teacherUid,
      teacherName: displayName,
      className: className || '5학년 2반',
      schoolName: schoolName || '전주신동초등학교',
    });
  }

  await recordAuditLog({
    workspaceOwnerUid,
    actorUid: teacherUid,
    actorName: displayName,
    action: 'TEACHER_PROFILE_UPDATED',
    targetType: 'user',
    targetId: teacherUid,
    reason: '교사 관리자 프로필 정보(이름, 소개, 아바타, 학급 정보) 수정',
    metadataSummary: `displayName: ${displayName}, avatarId: ${avatarId}, className: ${className || ''}, schoolName: ${schoolName || ''}`,
  });
}

/**
 * Regenerates circular derangement assignments for ALL active students in the classroom
 */
export async function generateFullClassroomAssignments(params: {
  workspaceOwnerUid: string;
  teacherUid: string;
  teacherName: string;
  classId: string;
  activeStudents: UserProfile[];
}): Promise<{ count: number }> {
  const { workspaceOwnerUid, teacherUid, teacherName, classId, activeStudents } = params;
  if (activeStudents.length < 2) {
    throw new Error('마니또 배정은 활성 학생이 최소 2명 이상이어야 합니다.');
  }

  const prefix = workspaceOwnerUid.slice(0, 8);
  const startsAt = new Date().toISOString().slice(0, 10);
  const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 1. Delete all old assignments and their letter threads
  const oldAssignSnap = await getDocs(
    query(collection(db, 'manittoAssignments'), where('workspaceOwnerUid', '==', workspaceOwnerUid))
  );
  await Promise.all(oldAssignSnap.docs.map((d) => deleteDoc(doc(db, 'manittoAssignments', d.id))));

  // 2. Circular derangement: shuffle all active students
  const shuffled = [...activeStudents].sort(() => Math.random() - 0.5);

  const createPromises = shuffled.map(async (giver, idx) => {
    const receiver = shuffled[(idx + 1) % shuffled.length];
    const assignId = `${prefix}_assign_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
    const threadId = `${prefix}_thread_${assignId.slice(-10)}`;

    const aPromise = setDoc(doc(db, 'manittoAssignments', assignId), {
      assignmentId: assignId,
      workspaceOwnerUid,
      classId,
      giverUid: giver.uid,
      receiverUid: receiver.uid,
      active: true,
      startsAt,
      endsAt,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const tPromise = setDoc(doc(db, 'letterThreads', threadId), {
      threadId,
      workspaceOwnerUid,
      classId,
      assignmentId: assignId,
      participantUids: [giver.uid, receiverUidSafe(receiver.uid)],
      lastMessageAt: new Date().toISOString(),
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return Promise.all([aPromise, tPromise]);
  });

  function receiverUidSafe(uid: string) {
    return uid;
  }

  await Promise.all(createPromises);

  await recordAuditLog({
    workspaceOwnerUid,
    actorUid: teacherUid,
    actorName: teacherName,
    action: 'FULL_MANITTO_REGENERATED',
    targetType: 'manittoAssignments',
    targetId: `${activeStudents.length}_students`,
    reason: `교사에 의한 전체 학생 ${activeStudents.length}명 순환 마니또 배정 생성`,
    metadataSummary: `총 ${activeStudents.length}명 전원 1:1 순환 배정 완료`,
  });

  return { count: activeStudents.length };
}

/**
 * Records an immutable teacher/system audit log entry
 */
export async function recordAuditLog(params: {
  workspaceOwnerUid: string;
  actorUid: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  metadataSummary: string;
}): Promise<void> {
  const logId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `auditLogs/${logId}`;
  try {
    await setDoc(doc(db, 'auditLogs', logId), {
      logId,
      workspaceOwnerUid: params.workspaceOwnerUid,
      actorUid: params.actorUid,
      actorName: sanitizeText(params.actorName, 80),
      action: sanitizeText(params.action, 80),
      targetType: sanitizeText(params.targetType, 40),
      targetId: sanitizeText(params.targetId, 128),
      reason: sanitizeText(params.reason, 300),
      metadataSummary: sanitizeText(params.metadataSummary, 400),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Evaluates all 5 badge criteria for a student and awards any newly unlocked badges
 */
export async function evaluateAndAwardBadges(params: {
  workspaceOwnerUid: string;
  studentUid: string;
  classId: string;
  missions: Mission[];
  submissions: MissionSubmission[];
  sentLettersCount: number;
  badges: Badge[];
  existingAwards: BadgeAward[];
}): Promise<string[]> {
  const {
    workspaceOwnerUid,
    studentUid,
    classId,
    missions,
    submissions,
    sentLettersCount,
    badges,
    existingAwards,
  } = params;

  const approvedSubs = submissions.filter(
    (s) => s.studentUid === studentUid && s.status === 'approved'
  );
  const existingBadgeIds = new Set(
    existingAwards.filter((a) => a.studentUid === studentUid).map((a) => a.badgeId)
  );

  const missionMap = new Map<string, Mission>(missions.map((m) => [m.missionId, m]));
  const newlyAwardedNames: string[] = [];

  // Calculate counts for each of the 5 badges
  const totalApprovedCount = approvedSubs.length;

  const observationApprovedCount = approvedSubs.filter((s) => {
    const m = missionMap.get(s.missionId);
    return m?.category === 'observation' || m?.badgeRuleType === 'observation';
  }).length;

  const careApprovedCount = approvedSubs.filter((s) => {
    const m = missionMap.get(s.missionId);
    return (
      m?.category === 'care' ||
      m?.category === 'cooperation' ||
      m?.badgeRuleType === 'care'
    );
  }).length;

  const distinctApprovedMissionIds = new Set(approvedSubs.map((s) => s.missionId));
  const hasTeacherApprovedMission = approvedSubs.some((s) => {
    const m = missionMap.get(s.missionId);
    return m?.requiresTeacherApproval === true;
  });

  // Also count cheer letters / mission_07 / mission_17
  const cheerMissionCount = approvedSubs.filter((s) => {
    const m = missionMap.get(s.missionId);
    return m?.badgeRuleType === 'letter_cheer';
  }).length;
  const totalLetterProgress = sentLettersCount + cheerMissionCount;

  for (const badge of badges) {
    if (!badge.active || existingBadgeIds.has(badge.badgeId)) continue;

    let unlocked = false;
    let snapshotText = '';

    if (badge.badgeId.endsWith('badge_01_sprout') && totalApprovedCount >= 1) {
      unlocked = true;
      snapshotText = `첫 번째 마니또 미션 완료 (총 ${totalApprovedCount}회 달성)`;
    } else if (badge.badgeId.endsWith('badge_02_messenger') && totalLetterProgress >= 3) {
      unlocked = true;
      snapshotText = `마니또 응원 편지 및 감사 쪽지 ${totalLetterProgress}회 작성 달성`;
    } else if (badge.badgeId.endsWith('badge_03_observer') && observationApprovedCount >= 5) {
      unlocked = true;
      snapshotText = `친구 장점 발견 및 관찰 미션 ${observationApprovedCount}회 완료`;
    } else if (badge.badgeId.endsWith('badge_04_carer') && careApprovedCount >= 5) {
      unlocked = true;
      snapshotText = `도움 및 배려·협력 미션 ${careApprovedCount}회 완료`;
    } else if (
      badge.badgeId.endsWith('badge_05_star') &&
      distinctApprovedMissionIds.size >= 15 &&
      hasTeacherApprovedMission
    ) {
      unlocked = true;
      snapshotText = `서로 다른 미션 ${distinctApprovedMissionIds.size}개 완료 및 교사 확인 조건 충족`;
    }

    if (unlocked) {
      const awardId = `award_${studentUid.slice(-10)}_${badge.badgeId.slice(-10)}`;
      await setDoc(doc(db, 'badgeAwards', awardId), {
        awardId,
        workspaceOwnerUid,
        studentUid,
        badgeId: badge.badgeId,
        classId,
        awardedAt: new Date().toISOString().slice(0, 10),
        criteriaSnapshot: sanitizeText(snapshotText, 200),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      newlyAwardedNames.push(`${badge.icon} ${badge.name}`);
    }
  }

  if (newlyAwardedNames.length > 0) {
    const statRef = doc(db, 'studentStats', studentUid);
    const statSnap = await getDoc(statRef);
    if (statSnap.exists()) {
      const currentEarned = existingBadgeIds.size + newlyAwardedNames.length;
      await updateDoc(statRef, {
        earnedBadgeCount: currentEarned,
        updatedAt: serverTimestamp(),
      });
    }
  }

  return newlyAwardedNames;
}

/**
 * Calculates live badge progress for display on the Badges page & Student Dashboard
 */
export function getBadgeProgress(params: {
  badge: Badge;
  studentUid: string;
  missions: Mission[];
  submissions: MissionSubmission[];
  sentLettersCount: number;
  existingAwards: BadgeAward[];
}): {
  earned: boolean;
  awardedAt: string;
  current: number;
  target: number;
  percentage: number;
} {
  const { badge, studentUid, missions, submissions, sentLettersCount, existingAwards } = params;
  const award = existingAwards.find(
    (a) => a.studentUid === studentUid && a.badgeId === badge.badgeId
  );
  const approvedSubs = submissions.filter(
    (s) => s.studentUid === studentUid && s.status === 'approved'
  );
  const missionMap = new Map<string, Mission>(missions.map((m) => [m.missionId, m]));

  let current = 0;
  const target = badge.targetCount || 1;

  if (badge.badgeId.endsWith('badge_01_sprout')) {
    current = Math.min(target, approvedSubs.length);
  } else if (badge.badgeId.endsWith('badge_02_messenger')) {
    const cheerMissionCount = approvedSubs.filter(
      (s) => missionMap.get(s.missionId)?.badgeRuleType === 'letter_cheer'
    ).length;
    current = Math.min(target, sentLettersCount + cheerMissionCount);
  } else if (badge.badgeId.endsWith('badge_03_observer')) {
    const obsCount = approvedSubs.filter((s) => {
      const m = missionMap.get(s.missionId);
      return m?.category === 'observation' || m?.badgeRuleType === 'observation';
    }).length;
    current = Math.min(target, obsCount);
  } else if (badge.badgeId.endsWith('badge_04_carer')) {
    const careCount = approvedSubs.filter((s) => {
      const m = missionMap.get(s.missionId);
      return (
        m?.category === 'care' ||
        m?.category === 'cooperation' ||
        m?.badgeRuleType === 'care'
      );
    }).length;
    current = Math.min(target, careCount);
  } else if (badge.badgeId.endsWith('badge_05_star')) {
    const distinctIds = new Set(approvedSubs.map((s) => s.missionId));
    current = Math.min(target, distinctIds.size);
  }

  const earned = Boolean(award) || current >= target;
  const percentage = Math.min(100, Math.round((current / target) * 100));

  return {
    earned,
    awardedAt: award?.awardedAt || '',
    current: earned ? target : current,
    target,
    percentage: earned ? 100 : percentage,
  };
}

/**
 * Submit a student mission practice record with duplicate prevention, date validation,
 * and atomic score ledger + stats update if auto-approved
 */
export async function submitMissionAction(params: {
  workspaceOwnerUid: string;
  studentUid: string;
  classId: string;
  mission: Mission;
  actionDescription: string;
  reflection: string;
  activityDate: string;
  evidenceNote: string;
  existingSubmissions: MissionSubmission[];
}): Promise<{ status: 'approved' | 'pending'; pointsAwarded: number; message: string }> {
  const {
    workspaceOwnerUid,
    studentUid,
    classId,
    mission,
    actionDescription,
    reflection,
    activityDate,
    evidenceNote,
    existingSubmissions,
  } = params;

  const cleanAction = sanitizeText(actionDescription, 500);
  const cleanReflection = sanitizeText(reflection, 500);
  const cleanEvidence = sanitizeText(evidenceNote, 200);

  if (cleanAction.length < 5) {
    throw new Error('실제로 실천한 행동을 5글자 이상 구체적으로 작성해 주세요.');
  }
  if (cleanReflection.length < 5) {
    throw new Error('실천 소감을 5글자 이상 따뜻하게 작성해 주세요.');
  }

  const badInAction = containsProfanity(cleanAction) || containsProfanity(cleanReflection);
  if (badInAction) {
    throw new Error('부적절한 표현이 포함되어 있어요. 친구를 배려하는 고운 말을 사용해 주세요.');
  }

  // Server-side date manipulation guard (cannot be future date)
  const todayStr = new Date().toISOString().slice(0, 10);
  if (activityDate > todayStr) {
    throw new Error('미래 날짜로는 실천 기록을 등록할 수 없어요. 오늘 또는 실천한 날짜를 선택해 주세요.');
  }

  // Check duplicate / maxCompletions guard
  const myMissionSubs = existingSubmissions.filter(
    (s) =>
      s.studentUid === studentUid &&
      s.missionId === mission.missionId &&
      (s.status === 'approved' || s.status === 'pending')
  );

  if (!mission.allowRepeat && myMissionSubs.length >= 1) {
    throw new Error('이 미션은 한 번만 참여할 수 있는 특별 미션이에요.');
  }
  if (myMissionSubs.length >= mission.maxCompletions) {
    throw new Error(`이 미션은 최대 ${mission.maxCompletions}회까지 달성할 수 있어요.`);
  }
  const sameDayPendingOrApproved = myMissionSubs.find((s) => s.activityDate === activityDate);
  if (sameDayPendingOrApproved) {
    throw new Error('같은 날짜에 이미 제출한 동일 미션 기록이 있어요. 내일 다시 도전해 볼까요?');
  }

  const isAutoApproved = !mission.requiresTeacherApproval;
  const status: 'approved' | 'pending' = isAutoApproved ? 'approved' : 'pending';
  const pointsAwarded = isAutoApproved ? mission.points : 0;

  const submissionId = `sub_${studentUid.slice(-8)}_${mission.missionId.slice(-6)}_${Date.now()}`;
  const ledgerId = `ledger_${submissionId}`;
  const statRef = doc(db, 'studentStats', studentUid);
  const subRef = doc(db, 'missionSubmissions', submissionId);
  const ledgerRef = doc(db, 'scoreLedger', ledgerId);

  try {
    await runTransaction(db, async (tx) => {
      const statSnap = await tx.get(statRef);
      const currentPoints = statSnap.exists() ? Number(statSnap.data().totalPoints || 0) : 0;
      const currentCount = statSnap.exists()
        ? Number(statSnap.data().completedMissionCount || 0)
        : 0;
      const currentBadges = statSnap.exists()
        ? Number(statSnap.data().earnedBadgeCount || 0)
        : 0;

      tx.set(subRef, {
        submissionId,
        workspaceOwnerUid,
        missionId: mission.missionId,
        studentUid,
        classId,
        actionDescription: cleanAction,
        reflection: cleanReflection,
        activityDate,
        evidenceNote: cleanEvidence,
        status,
        awardedPoints: pointsAwarded,
        reviewedBy: isAutoApproved ? 'system_auto' : '',
        reviewedAt: isAutoApproved ? new Date().toISOString() : '',
        reviewComment: isAutoApproved ? '자동 승인 완료! 친절을 실천해 주어서 고마워요.' : '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (isAutoApproved) {
        tx.set(ledgerRef, {
          ledgerId,
          workspaceOwnerUid,
          studentUid,
          classId,
          sourceType: 'mission',
          sourceId: submissionId,
          pointsDelta: pointsAwarded,
          activityDate,
          reason: `미션 달성 자동 승인: ${mission.title}`,
          createdBy: 'system_auto',
          reversalOf: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (statSnap.exists()) {
          tx.update(statRef, {
            totalPoints: currentPoints + pointsAwarded,
            completedMissionCount: currentCount + 1,
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.set(statRef, {
            studentUid,
            workspaceOwnerUid,
            classId,
            totalPoints: pointsAwarded,
            completedMissionCount: 1,
            earnedBadgeCount: currentBadges,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    });

    return {
      status,
      pointsAwarded,
      message: isAutoApproved
        ? `짝짝짝! 미션 실천 기록이 완료되어 ${pointsAwarded}점을 획득했어요!`
        : '선생님 확인 미션으로 제출되었어요! 선생님이 확인하시면 점수가 지급됩니다.',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `missionSubmissions/${submissionId}`);
  }
}

/**
 * Teacher approves, rejects, or deletes a mission submission atomically
 * Updates scoreLedger, studentStats, and records an AuditLog
 */
export async function reviewMissionSubmission(params: {
  workspaceOwnerUid: string;
  teacherUid: string;
  teacherName: string;
  submission: MissionSubmission;
  missionTitle: string;
  missionPoints: number;
  decision: 'approved' | 'rejected' | 'deleted';
  reviewComment: string;
}): Promise<void> {
  const {
    workspaceOwnerUid,
    teacherUid,
    teacherName,
    submission,
    missionTitle,
    missionPoints,
    decision,
    reviewComment,
  } = params;

  const subRef = doc(db, 'missionSubmissions', submission.submissionId);
  const statRef = doc(db, 'studentStats', submission.studentUid);
  const cleanComment = sanitizeText(
    reviewComment || (decision === 'approved' ? '선생님 승인 완료' : '내용 보완 또는 삭제 조치'),
    200
  );

  try {
    await runTransaction(db, async (tx) => {
      const subSnap = await tx.get(subRef);
      if (!subSnap.exists()) {
        throw new Error('해당 미션 기록을 찾을 수 없습니다.');
      }
      const prevStatus = subSnap.data().status as MissionSubmission['status'];
      const prevPoints = Number(subSnap.data().awardedPoints || 0);

      const statSnap = await tx.get(statRef);
      const currentPoints = statSnap.exists() ? Number(statSnap.data().totalPoints || 0) : 0;
      const currentCount = statSnap.exists()
        ? Number(statSnap.data().completedMissionCount || 0)
        : 0;

      let pointsDelta = 0;
      let countDelta = 0;
      let newAwardedPoints = prevPoints;

      if (prevStatus !== 'approved' && decision === 'approved') {
        pointsDelta = missionPoints;
        countDelta = 1;
        newAwardedPoints = missionPoints;
      } else if (prevStatus === 'approved' && (decision === 'rejected' || decision === 'deleted')) {
        pointsDelta = -prevPoints;
        countDelta = -1;
        newAwardedPoints = 0;
      }

      tx.update(subRef, {
        status: decision,
        awardedPoints: newAwardedPoints,
        reviewedBy: teacherUid,
        reviewedAt: new Date().toISOString(),
        reviewComment: cleanComment,
        updatedAt: serverTimestamp(),
      });

      if (pointsDelta !== 0) {
        const ledgerId = `ledger_rev_${submission.submissionId.slice(-12)}_${Date.now()}`;
        const ledgerRef = doc(db, 'scoreLedger', ledgerId);
        tx.set(ledgerRef, {
          ledgerId,
          workspaceOwnerUid,
          studentUid: submission.studentUid,
          classId: submission.classId,
          sourceType: pointsDelta > 0 ? 'mission' : 'reversal',
          sourceId: submission.submissionId,
          pointsDelta,
          activityDate: submission.activityDate,
          reason:
            pointsDelta > 0
              ? `교사 미션 승인 (${missionTitle})`
              : `교사 미션 ${decision === 'deleted' ? '삭제' : '반려'}에 따른 점수 회수 (${cleanComment})`,
          createdBy: teacherUid,
          reversalOf: pointsDelta < 0 ? submission.submissionId : '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (statSnap.exists()) {
          tx.update(statRef, {
            totalPoints: Math.max(0, currentPoints + pointsDelta),
            completedMissionCount: Math.max(0, currentCount + countDelta),
            updatedAt: serverTimestamp(),
          });
        }
      }
    });

    await recordAuditLog({
      workspaceOwnerUid,
      actorUid: teacherUid,
      actorName: teacherName,
      action: `MISSION_${decision.toUpperCase()}`,
      targetType: 'missionSubmission',
      targetId: submission.submissionId,
      reason: cleanComment,
      metadataSummary: `미션 [${missionTitle}] 상태 변경 (${submission.status} -> ${decision})`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `missionSubmissions/${submission.submissionId}`);
  }
}

/**
 * Teacher manual score adjustment with mandatory reason and ledger + audit log
 */
export async function adjustStudentScore(params: {
  workspaceOwnerUid: string;
  teacherUid: string;
  teacherName: string;
  studentUid: string;
  studentName: string;
  classId: string;
  pointsDelta: number;
  reason: string;
}): Promise<void> {
  const {
    workspaceOwnerUid,
    teacherUid,
    teacherName,
    studentUid,
    studentName,
    classId,
    pointsDelta,
    reason,
  } = params;

  const cleanReason = sanitizeText(reason, 240);
  if (!cleanReason) {
    throw new Error('점수 조정 사유를 반드시 입력해 주세요.');
  }
  if (pointsDelta === 0 || pointsDelta < -500 || pointsDelta > 500) {
    throw new Error('조정 점수는 -500점에서 +500점 사이의 0이 아닌 값이어야 합니다.');
  }

  const ledgerId = `ledger_adj_${studentUid.slice(-8)}_${Date.now()}`;
  const ledgerRef = doc(db, 'scoreLedger', ledgerId);
  const statRef = doc(db, 'studentStats', studentUid);
  const todayStr = new Date().toISOString().slice(0, 10);

  try {
    await runTransaction(db, async (tx) => {
      const statSnap = await tx.get(statRef);
      const currentPoints = statSnap.exists() ? Number(statSnap.data().totalPoints || 0) : 0;

      tx.set(ledgerRef, {
        ledgerId,
        workspaceOwnerUid,
        studentUid,
        classId,
        sourceType: 'adjustment',
        sourceId: teacherUid,
        pointsDelta,
        activityDate: todayStr,
        reason: cleanReason,
        createdBy: teacherUid,
        reversalOf: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (statSnap.exists()) {
        tx.update(statRef, {
          totalPoints: Math.max(0, currentPoints + pointsDelta),
          updatedAt: serverTimestamp(),
        });
      }
    });

    await recordAuditLog({
      workspaceOwnerUid,
      actorUid: teacherUid,
      actorName: teacherName,
      action: 'SCORE_ADJUSTMENT',
      targetType: 'studentStats',
      targetId: studentUid,
      reason: cleanReason,
      metadataSummary: `${studentName} 학생 점수 ${pointsDelta > 0 ? `+${pointsDelta}` : pointsDelta}점 조정`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `scoreLedger/${ledgerId}`);
  }
}

/**
 * Send an anonymous letter within an authorized Manitto assignment relationship
 */
export async function sendAnonymousLetter(params: {
  workspaceOwnerUid: string;
  senderUid: string;
  classId: string;
  direction: 'from_manitto' | 'to_manitto';
  subject: string;
  body: string;
  assignments: ManittoAssignment[];
  threads: LetterThread[];
}): Promise<void> {
  const {
    workspaceOwnerUid,
    senderUid,
    classId,
    direction,
    subject,
    body,
    assignments,
    threads,
  } = params;

  const cleanSubject = sanitizeText(subject || '따뜻한 마니또 편지가 도착했어요 💌', 120);
  const cleanBody = sanitizeText(body, 1000);

  if (cleanBody.length < 3) {
    throw new Error('편지 내용을 3글자 이상 따뜻하게 작성해 주세요.');
  }

  const badWord = containsProfanity(cleanSubject) || containsProfanity(cleanBody);
  if (badWord) {
    throw new Error('부적절한 표현이 포함되어 있어요. 고운 말과 따뜻한 응원을 담아 작성해 주세요.');
  }

  // Verify authorized Manitto relationship
  const activeAssignment =
    direction === 'from_manitto'
      ? assignments.find((a) => a.active && a.giverUid === senderUid)
      : assignments.find((a) => a.active && a.receiverUid === senderUid);

  if (!activeAssignment) {
    throw new Error('현재 배정된 마니또 관계가 확인되지 않아 편지를 보낼 수 없습니다.');
  }

  const receiverUid =
    direction === 'from_manitto' ? activeAssignment.receiverUid : activeAssignment.giverUid;

  let thread = threads.find((t) => t.assignmentId === activeAssignment.assignmentId);
  const threadId =
    thread?.threadId ||
    `${workspaceOwnerUid.slice(0, 8)}_thread_${activeAssignment.assignmentId.slice(-8)}`;

  if (!thread) {
    await setDoc(doc(db, 'letterThreads', threadId), {
      threadId,
      workspaceOwnerUid,
      classId,
      assignmentId: activeAssignment.assignmentId,
      participantUids: [activeAssignment.giverUid, activeAssignment.receiverUid],
      lastMessageAt: new Date().toISOString(),
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(doc(db, 'letterThreads', threadId), {
      lastMessageAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  }

  const letterId = `letter_${senderUid.slice(-6)}_${Date.now()}`;
  try {
    await setDoc(doc(db, 'letters', letterId), {
      letterId,
      workspaceOwnerUid,
      threadId,
      classId,
      senderUid,
      receiverUid,
      senderDirection: direction,
      subject: cleanSubject,
      body: cleanBody,
      readAt: '',
      moderationStatus: 'normal',
      deletedAt: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `letters/${letterId}`);
  }
}

/**
 * Submit a safety report for a letter or lounge message
 */
export async function submitSafetyReport(params: {
  workspaceOwnerUid: string;
  classId: string;
  reporterUid: string;
  targetType: 'letter' | 'loungeMessage' | 'mission';
  targetId: string;
  targetPreview: string;
  reason: string;
}): Promise<void> {
  const { workspaceOwnerUid, classId, reporterUid, targetType, targetId, targetPreview, reason } =
    params;
  const cleanReason = sanitizeText(reason, 300);
  if (!cleanReason) {
    throw new Error('신고 사유를 입력해 주세요.');
  }

  const reportId = `rep_${targetType}_${Date.now()}`;
  try {
    await setDoc(doc(db, 'reports', reportId), {
      reportId,
      workspaceOwnerUid,
      classId,
      reporterUid,
      targetType,
      targetId,
      targetPreview: sanitizeText(targetPreview, 300),
      reason: cleanReason,
      status: 'pending',
      reviewedBy: '',
      reviewedAt: '',
      reviewNote: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (targetType === 'letter') {
      await updateDoc(doc(db, 'letters', targetId), {
        moderationStatus: 'reported',
        updatedAt: serverTimestamp(),
      });
    } else if (targetType === 'loungeMessage') {
      await updateDoc(doc(db, 'loungeMessages', targetId), {
        moderationStatus: 'reported',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}`);
  }
}
