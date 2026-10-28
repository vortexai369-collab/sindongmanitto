export type UserRole = 'teacher' | 'student';
export type ProfileVisibility = 'private' | 'manitto' | 'class';
export type AccountStatus = 'active' | 'inactive';

export type MissionCategory = 'kindness' | 'observation' | 'care' | 'gratitude' | 'cooperation';
export type MissionDifficulty = 'easy' | 'medium' | 'hard';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'deleted';

export type ModerationStatus = 'normal' | 'reported' | 'hidden';
export type LoungeStatus = 'scheduled' | 'waiting' | 'active' | 'ended';
export type PresenceStatus = 'waiting' | 'active' | 'left';

export interface UserProfile {
  uid: string;
  workspaceOwnerUid: string;
  role: UserRole;
  studentLoginId: string;
  passwordHash: string;
  displayName: string;
  classId: string;
  avatarId: string;
  bio: string;
  interests: string[];
  hobbies: string[];
  favoriteFood: string;
  strengths: string;
  cheerWanted: string;
  profileVisibility: ProfileVisibility;
  accountStatus: AccountStatus;
  lastLoginAt: string;
  lastHeartbeatAt: string;
  isOnlineSession: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ClassRoom {
  classId: string;
  workspaceOwnerUid: string;
  name: string;
  schoolName: string;
  teacherUids: string[];
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ManittoAssignment {
  assignmentId: string;
  workspaceOwnerUid: string;
  classId: string;
  giverUid: string;
  receiverUid: string;
  active: boolean;
  startsAt: string;
  endsAt: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Mission {
  missionId: string;
  workspaceOwnerUid: string;
  orderIndex: number;
  title: string;
  description: string;
  howTo: string;
  category: MissionCategory;
  difficulty: MissionDifficulty;
  points: number;
  active: boolean;
  requiresTeacherApproval: boolean;
  allowRepeat: boolean;
  maxCompletions: number;
  badgeRuleType: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MissionSubmission {
  submissionId: string;
  workspaceOwnerUid: string;
  missionId: string;
  studentUid: string;
  classId: string;
  actionDescription: string;
  reflection: string;
  activityDate: string;
  evidenceNote: string;
  status: SubmissionStatus;
  awardedPoints: number;
  reviewedBy: string;
  reviewedAt: string;
  reviewComment: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ScoreLedger {
  ledgerId: string;
  workspaceOwnerUid: string;
  studentUid: string;
  classId: string;
  sourceType: 'mission' | 'adjustment' | 'reversal';
  sourceId: string;
  pointsDelta: number;
  activityDate: string;
  reason: string;
  createdBy: string;
  reversalOf: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudentStats {
  studentUid: string;
  workspaceOwnerUid: string;
  classId: string;
  totalPoints: number;
  completedMissionCount: number;
  earnedBadgeCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Badge {
  badgeId: string;
  workspaceOwnerUid: string;
  name: string;
  description: string;
  icon: string;
  criteria: string;
  targetCount: number;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BadgeAward {
  awardId: string;
  workspaceOwnerUid: string;
  studentUid: string;
  badgeId: string;
  classId: string;
  awardedAt: string;
  criteriaSnapshot: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LetterThread {
  threadId: string;
  workspaceOwnerUid: string;
  classId: string;
  assignmentId: string;
  participantUids: string[];
  lastMessageAt: string;
  status: 'active' | 'archived';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Letter {
  letterId: string;
  workspaceOwnerUid: string;
  threadId: string;
  classId: string;
  senderUid: string;
  receiverUid: string;
  senderDirection: 'from_manitto' | 'to_manitto';
  subject: string;
  body: string;
  readAt: string;
  moderationStatus: ModerationStatus;
  deletedAt: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LoungeSession {
  sessionId: string;
  workspaceOwnerUid: string;
  classId: string;
  title: string;
  noticeRules: string;
  scheduledDate: string;
  startsAt: string;
  endsAt: string;
  status: LoungeStatus;
  waitingCount: number;
  participantCount: number;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LoungeParticipant {
  participantUid: string;
  workspaceOwnerUid: string;
  sessionId: string;
  anonymousAlias: string;
  presenceStatus: PresenceStatus;
  aliasChangeCount: number;
  joinedAt: string;
  lastHeartbeatAt: string;
  aliasChangedAt: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LoungeMessage {
  messageId: string;
  workspaceOwnerUid: string;
  sessionId: string;
  classId: string;
  senderUid: string;
  anonymousAlias: string;
  body: string;
  moderationStatus: ModerationStatus;
  hiddenAt: string;
  hiddenBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ReportRecord {
  reportId: string;
  workspaceOwnerUid: string;
  classId: string;
  reporterUid: string;
  targetType: 'letter' | 'loungeMessage' | 'mission';
  targetId: string;
  targetPreview: string;
  reason: string;
  status: 'pending' | 'resolved' | 'dismissed';
  reviewedBy: string;
  reviewedAt: string;
  reviewNote: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AuditLog {
  logId: string;
  workspaceOwnerUid: string;
  actorUid: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  metadataSummary: string;
  createdAt?: unknown;
}

export interface AppSetting {
  settingId: string;
  workspaceOwnerUid: string;
  loungeRules: string;
  profilePolicy: string;
  letterModerationPolicy: string;
  dataRetentionPolicy: string;
  identityRevealPolicy: 'hidden' | 'revealed';
  allowPhotoEvidence: boolean;
  updatedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type StudentNavTab =
  | 'home'
  | 'profile'
  | 'missions'
  | 'growth'
  | 'badges'
  | 'letters'
  | 'lounge'
  | 'settings';

export type TeacherNavTab =
  | 'dashboard'
  | 'students'
  | 'activities'
  | 'missions'
  | 'assignments'
  | 'reports'
  | 'lounge'
  | 'stats'
  | 'settings';
