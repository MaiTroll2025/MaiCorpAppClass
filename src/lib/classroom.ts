import { supabase } from './supabase'

export interface ClassroomSession {
  id: string
  course_id: string
  lesson_id: string | null
  instructor_id: string
  title: string
  description: string
  learning_objectives: string[]
  scheduled_at: string
  expected_duration_minutes: number | null
  started_at: string | null
  ended_at: string | null
  max_participants: number
  allow_student_screen_share: boolean
  public_qa_enabled: boolean
  public_stream_enabled: boolean
  status: 'scheduled' | 'live' | 'ended' | 'cancelled'
  course: { title: string } | null
  instructor: { display_name: string | null } | null
}

export interface SharedClassLink {
  id: string
  session_id: string
  created_by: string
  url: string
  title: string | null
  description: string | null
  expiration_mode: string
  created_at: string
  expires_at: string | null
  revoked_at: string | null
}

export interface HandRaise {
  id: string
  session_id: string
  student_id: string
  requested_at: string
  status: 'pending' | 'approved' | 'denied' | 'cancelled'
  speaking_permission_active: boolean
  student: { display_name: string | null } | null
}

export interface SessionParticipant {
  user_id: string
  joined_at: string
  left_at: string | null
  participant: { display_name: string | null } | null
}

export interface ClassroomRosterMember {
  user_id: string
  display_name: string
  participant_role: 'student' | 'instructor'
  joined_at: string
}

export interface ClassroomMessage {
  id: string
  session_id: string
  user_id: string
  body: string
  created_at: string
}

export interface ClassroomQuestion {
  id: string
  session_id: string
  user_id: string
  question: string
  status: 'open' | 'answered'
  response: string | null
  answered_by: string | null
  answered_at: string | null
  created_at: string
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listClassSessions(): Promise<ClassroomSession[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('class_sessions')
    .select(
      'id, course_id, lesson_id, instructor_id, title, description, learning_objectives, scheduled_at, expected_duration_minutes, started_at, ended_at, max_participants, allow_student_screen_share, public_qa_enabled, public_stream_enabled, status, course:courses(title), instructor:profiles!class_sessions_instructor_id_fkey(display_name)',
    )
    .in('status', ['scheduled', 'live'])
    .order('scheduled_at', { ascending: true })
    .limit(40)

  if (error) throw new Error(`Could not load live classes: ${error.message}`)
  return (data ?? []) as unknown as ClassroomSession[]
}

export async function getClassSession(sessionId: string): Promise<ClassroomSession | null> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('class_sessions')
    .select(
      'id, course_id, lesson_id, instructor_id, title, description, learning_objectives, scheduled_at, expected_duration_minutes, started_at, ended_at, max_participants, allow_student_screen_share, public_qa_enabled, public_stream_enabled, status, course:courses(title), instructor:profiles!class_sessions_instructor_id_fkey(display_name)',
    )
    .eq('id', sessionId)
    .maybeSingle()

  if (error) throw new Error(`Could not load the class: ${error.message}`)
  return data as unknown as ClassroomSession | null
}

export async function listActiveClassLinks(sessionId: string): Promise<SharedClassLink[]> {
  const client = requireSupabase()
  const now = new Date().toISOString()
  const { data, error } = await client
    .from('session_shared_links')
    .select('id, session_id, created_by, url, title, description, expiration_mode, created_at, expires_at, revoked_at')
    .eq('session_id', sessionId)
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(`Could not load shared links: ${error.message}`)
  return (data ?? []) as unknown as SharedClassLink[]
}

export async function listClassHandRaises(sessionId: string): Promise<HandRaise[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('class_hand_raises')
    .select(
      'id, session_id, student_id, requested_at, status, speaking_permission_active, student:profiles!class_hand_raises_student_id_fkey(display_name)',
    )
    .eq('session_id', sessionId)
    .order('requested_at', { ascending: true })
    .limit(100)

  if (error) throw new Error(`Could not load speaking requests: ${error.message}`)
  return (data ?? []) as unknown as HandRaise[]
}

export async function listSessionParticipants(sessionId: string): Promise<SessionParticipant[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('class_attendance')
    .select('user_id, joined_at, left_at, participant:profiles!class_attendance_user_id_fkey(display_name)')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true })
    .limit(100)

  if (error) throw new Error(`Could not load class participants: ${error.message}`)
  return (data ?? []) as unknown as SessionParticipant[]
}

export async function listClassroomRoster(sessionId: string): Promise<ClassroomRosterMember[]> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_classroom_roster', { target_session_id: sessionId })
  if (error) throw new Error(`Could not load classroom participants: ${error.message}`)
  return (data ?? []) as ClassroomRosterMember[]
}

export async function listClassroomMessages(sessionId: string): Promise<ClassroomMessage[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('classroom_messages')
    .select('id, session_id, user_id, body, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(`Could not load classroom chat: ${error.message}`)
  return ((data ?? []) as unknown as ClassroomMessage[]).reverse()
}

export async function listClassroomQuestions(sessionId: string): Promise<ClassroomQuestion[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('classroom_questions')
    .select('id, session_id, user_id, question, status, response, answered_by, answered_at, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) throw new Error(`Could not load classroom questions: ${error.message}`)
  return (data ?? []) as unknown as ClassroomQuestion[]
}

export interface Subscription {
  id: string
  user_id: string
  provider: string
  provider_subscription_id: string | null
  plan_id: string | null
  status: string
  cancel_at_period_end: boolean
  current_period_start: string | null
  current_period_end: string | null
  cancelled_at: string | null
  created_at: string
}

export async function listAllSubscriptions(): Promise<Subscription[]> {
  const client = requireSupabase()
  const { data, error } = await client.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) throw new Error(`Could not load subscriptions: ${error.message}`)
  return (data ?? []) as Subscription[]
}

export async function cancelSubscription(targetUserId: string, reason?: string) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('cancel_user_subscription', { target_user_id: targetUserId, cancel_reason: reason ?? null })
  if (error) throw new Error(error.message)
  return data
}
