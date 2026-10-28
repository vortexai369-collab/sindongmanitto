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
 * Seeds the initial Jeonju Shindong Elementary 5-2 Classroom workspace if not yet initialized
 */
export async function ensureWorkspaceSeeded(workspaceOwnerUid: string): Promise<void> {
  const classRef = doc(db, 'classes', 'class_5_2');
  try {
    const snap = await getDoc(classRef);
    if (snap.exists() && snap.data()?.workspaceOwnerUid === workspaceOwnerUid) {
      return;
    }
  } catch {
    // Document may not exist or belong to another session; proceed with scoped doc IDs
  }

  const prefix = workspaceOwnerUid.slice(0, 8);
  const scopedClassId = `class_${prefix}_5_2`;
  const scopedClassRef = doc(db, 'classes', scopedClassId);

  try {
    const existingClass = await getDoc(scopedClassRef);
    if (existingClass.exists()) {
      return;
    }
  } catch {
    // Continue creating initial seed
  }

  try {
    // 1. Classroom
    const baseClass = getInitialClassroom(workspaceOwnerUid);
    await setDoc(scopedClassRef, {
      ...baseClass,
      classId: scopedClassId,
      teacherUids: [`teacher_${prefix}`],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 2. App Settings
    const settingsId = `settings_${prefix}`;
    const baseSettings = getInitialAppSettings(workspaceOwnerUid);
    await setDoc(doc(db, 'appSettings', settingsId), {
      ...baseSettings,
      settingId: settingsId,
      updatedBy: `teacher_${prefix}`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 3. Missions (20)
    const missions = getInitialMissions(workspaceOwnerUid);
    for (const m of missions) {
      const mId = `${prefix}_${m.missionId}`;
      await setDoc(doc(db, 'missions', mId), {
        ...m,
        missionId: mId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // 4. Badges (5)
    const badges = getInitialBadges(workspaceOwnerUid);
    for (const b of badges) {
      const bId = `${prefix}_${b.badgeId}`;
      await setDoc(doc(db, 'badges', bId), {
        ...b,
        badgeId: bId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // 5. Users (1 Teacher + 6 Students)
    const users = getInitialUsers(workspaceOwnerUid);
    for (const u of users) {
      const uId = `${prefix}_${u.uid}`;
      await setDoc(doc(db, 'users', uId), {
        ...u,
        uid: uId,
        classId: scopedClassId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // 6. Manitto Assignments + Letter Threads
    const assignments = getInitialAssignments(workspaceOwnerUid);
    for (const a of assignments) {
      const aId = `${prefix}_${a.assignmentId}`;
      const giverUid = `${prefix}_${a.giverUid}`;
      const receiverUid = `${prefix}_${a.receiverUid}`;
      await setDoc(doc(db, 'manittoAssignments', aId), {
        ...a,
        assignmentId: aId,
        classId: scopedClassId,
        giverUid,
        receiverUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const threadId = `${prefix}_thread_${a.assignmentId}`;
      await setDoc(doc(db, 'letterThreads', threadId), {
        threadId,
        workspaceOwnerUid,
        classId: scopedClassId,
        assignmentId: aId,
        participantUids: [giverUid, receiverUid],
        lastMessageAt: new Date().toISOString(),
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // 7. Initial Mission Submissions & Score Ledger & Student Stats
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

    for (const item of initialSubmissions) {
      const subId = `${prefix}_${item.subKey}`;
      const studentUid = `${prefix}_${item.studentShort}`;
      const missionId = `${prefix}_${item.missionShort}`;
      const actDate = getDateDaysAgo(item.daysAgo);
      const isApproved = item.status === 'approved';

      await setDoc(doc(db, 'missionSubmissions', subId), {
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
      });

      if (isApproved) {
        pointsPerStudent[item.studentShort].points += item.points;
        pointsPerStudent[item.studentShort].count += 1;

        const ledgerId = `${prefix}_ledger_${item.subKey}`;
        await setDoc(doc(db, 'scoreLedger', ledgerId), {
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
        });
      }
    }

    // 8. Initial Badge Award for student_01 (친절의 새싹)
    const firstAwardId = `${prefix}_award_s01_b01`;
    await setDoc(doc(db, 'badgeAwards', firstAwardId), {
      awardId: firstAwardId,
      workspaceOwnerUid,
      studentUid: `${prefix}_student_01`,
      badgeId: `${prefix}_badge_01_sprout`,
      classId: scopedClassId,
      awardedAt: getDateDaysAgo(4),
      criteriaSnapshot: '첫 번째 미션 완료 달성',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Save StudentStats for all 6 students
    for (const sKey of Object.keys(pointsPerStudent)) {
      const sUid = `${prefix}_${sKey}`;
      const badgeCount = sKey === 'student_01' ? 1 : 0;
      await setDoc(doc(db, 'studentStats', sUid), {
        studentUid: sUid,
        workspaceOwnerUid,
        classId: scopedClassId,
        totalPoints: pointsPerStudent[sKey].points,
        completedMissionCount: pointsPerStudent[sKey].count,
        earnedBadgeCount: badgeCount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // 9. Sample Anonymous Letters for student_01 (both as Giver to student_02 and Receiver from student_06)
    const letter1Id = `${prefix}_letter_01`;
    await setDoc(doc(db, 'letters', letter1Id), {
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
    });

    const letter2Id = `${prefix}_letter_02`;
    await setDoc(doc(db, 'letters', letter2Id), {
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
    });

    // 10. Active Lounge Session + Sample Messages
    const sessionId = `${prefix}_lounge_today`;
    const todayStr = new Date().toISOString().slice(0, 10);
    await setDoc(doc(db, 'loungeSessions', sessionId), {
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
    });

    // Participants in Lounge
    const p1Uid = `${prefix}_student_01`;
    await setDoc(doc(db, 'loungeSessions', sessionId, 'participants', p1Uid), {
      participantUid: p1Uid,
      workspaceOwnerUid,
      sessionId,
      anonymousAlias: '구름 위 토끼',
      presenceStatus: 'active',
      aliasChangeCount: 0,
      joinedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      aliasChangedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const p2Uid = `${prefix}_student_02`;
    await setDoc(doc(db, 'loungeSessions', sessionId, 'participants', p2Uid), {
      participantUid: p2Uid,
      workspaceOwnerUid,
      sessionId,
      anonymousAlias: '초록빛 다람쥐',
      presenceStatus: 'active',
      aliasChangeCount: 0,
      joinedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      aliasChangedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const p3Uid = `${prefix}_student_03`;
    await setDoc(doc(db, 'loungeSessions', sessionId, 'participants', p3Uid), {
      participantUid: p3Uid,
      workspaceOwnerUid,
      sessionId,
      anonymousAlias: '민트색 고양이',
      presenceStatus: 'active',
      aliasChangeCount: 0,
      joinedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      aliasChangedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const p6Uid = `${prefix}_student_06`;
    await setDoc(doc(db, 'loungeSessions', sessionId, 'participants', p6Uid), {
      participantUid: p6Uid,
      workspaceOwnerUid,
      sessionId,
      anonymousAlias: '별똥별 여우',
      presenceStatus: 'waiting',
      aliasChangeCount: 0,
      joinedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      aliasChangedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const msg1Id = `${prefix}_lmsg_01`;
    await setDoc(doc(db, 'loungeMessages', msg1Id), {
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
    });

    const msg2Id = `${prefix}_lmsg_02`;
    await setDoc(doc(db, 'loungeMessages', msg2Id), {
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
    });

    // 11. Initial Audit Log
    const log1Id = `${prefix}_audit_init`;
    await setDoc(doc(db, 'auditLogs', log1Id), {
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
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'workspaceSeed');
  }
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
