import type { ContentStatus, QuestionStatus, Role } from './types.ts';

// Mirrors public.content_transition_allowed / question_transition_allowed in SQL.
// The DB is the enforcement point; this copy drives the UI and the demo repository.

const any = (roles: Role[], allowed: Role[]) => roles.some((r) => allowed.includes(r));
const EDIT: Role[] = ['owner', 'admin', 'editor'];
const REVIEW: Role[] = ['owner', 'admin', 'reviewer', 'rabbi'];
const ADMIN: Role[] = ['owner', 'admin'];

export function canEdit(roles: Role[]) { return any(roles, EDIT); }
export function canReview(roles: Role[]) { return any(roles, REVIEW); }
export function isAdmin(roles: Role[]) { return any(roles, ADMIN); }
export function isStaff(roles: Role[]) { return roles.length > 0; }

export function contentTransitionAllowed(from: ContentStatus, to: ContentStatus, roles: Role[]): boolean {
  if (from === to) return true;
  const key = `${from}>${to}`;
  switch (key) {
    case 'draft>in_review': return canEdit(roles);
    case 'in_review>draft': return canEdit(roles) || canReview(roles);
    case 'in_review>approved': return canReview(roles);
    case 'approved>draft': return canReview(roles);
    case 'approved>published': return canReview(roles);
    case 'published>draft': return isAdmin(roles) || canReview(roles);
    case 'published>archived': return isAdmin(roles);
    case 'archived>draft': return isAdmin(roles);
    case 'draft>archived': return isAdmin(roles);
    default: return false;
  }
}

export function nextContentStatuses(from: ContentStatus, roles: Role[]): ContentStatus[] {
  const all: ContentStatus[] = ['draft', 'in_review', 'approved', 'published', 'archived'];
  return all.filter((to) => to !== from && contentTransitionAllowed(from, to, roles));
}

export function questionTransitionAllowed(from: QuestionStatus, to: QuestionStatus, roles: Role[], consent: boolean): boolean {
  if (from === to) return true;
  const triage: Role[] = ['owner', 'admin', 'editor', 'reviewer'];
  switch (`${from}>${to}`) {
    case 'submitted>triaged':
    case 'submitted>closed':
    case 'triaged>assigned':
    case 'triaged>closed':
      return any(roles, triage);
    case 'assigned>answered': return any(roles, ['owner', 'admin', 'editor', 'rabbi']);
    case 'answered>assigned': return any(roles, ['owner', 'admin', 'editor', 'reviewer', 'rabbi']);
    // Only the rabbi role approves an answer given in his name.
    case 'answered>approved': return roles.includes('rabbi');
    case 'approved>published': return consent && any(roles, ['owner', 'admin', 'rabbi']);
    case 'approved>private_delivered': return any(roles, ['owner', 'admin', 'rabbi']);
    case 'published>closed':
    case 'private_delivered>closed':
      return any(roles, ['owner', 'admin', 'rabbi']);
    default: return false;
  }
}

export function nextQuestionStatuses(from: QuestionStatus, roles: Role[], consent: boolean): QuestionStatus[] {
  const all: QuestionStatus[] = ['submitted', 'triaged', 'assigned', 'answered', 'approved', 'published', 'private_delivered', 'closed'];
  return all.filter((to) => to !== from && questionTransitionAllowed(from, to, roles, consent));
}

export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
  draft: 'טיוטה', in_review: 'בבדיקה', approved: 'מאושר', published: 'פורסם', archived: 'בארכיון',
};
export const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = {
  submitted: 'התקבלה', triaged: 'מוינה', assigned: 'הועברה למענה', answered: 'נענתה — ממתינה לאישור',
  approved: 'אושרה', published: 'פורסמה', private_delivered: 'נמסרה לשואל', closed: 'סגורה',
};
export const ROLE_LABEL: Record<Role, string> = {
  owner: 'בעלים', admin: 'מנהל', editor: 'עורך', reviewer: 'בודק', rabbi: 'הרב', viewer: 'צופה',
};

export class VersionConflictError extends Error {
  constructor() {
    super('הרשומה שונתה בידי משתמש אחר מאז שנטענה. רעננו כדי לראות את הגרסה העדכנית.');
    this.name = 'VersionConflictError';
  }
}
export class PermissionError extends Error {
  constructor(msg = 'אין לך הרשאה לפעולה זו.') {
    super(msg);
    this.name = 'PermissionError';
  }
}
