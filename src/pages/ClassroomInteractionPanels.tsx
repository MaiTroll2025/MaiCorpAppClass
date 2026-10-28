import { useEffect, useState, type FormEvent } from 'react'
import {
  listClassroomMessages,
  listClassroomQuestions,
  type ClassroomMessage,
  type ClassroomQuestion,
  type ClassroomRosterMember,
} from '../lib/classroom'
import { supabase } from '../lib/supabase'

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function ClassroomChatPanel({
  sessionId,
  userId,
  roster,
  isLive,
}: {
  sessionId: string
  userId: string
  roster: ClassroomRosterMember[]
  isLive: boolean
}) {
  const [messages, setMessages] = useState<ClassroomMessage[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    async function refresh() {
      try {
        const items = await listClassroomMessages(sessionId)
        if (active) {
          setMessages(items)
          setError('')
        }
      } catch (cause) {
        if (active) setError(getErrorMessage(cause, 'Could not load classroom chat.'))
      }
    }
    void refresh()
    const channel = client
      .channel(`classroom-chat-${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'classroom_messages',
        filter: `session_id=eq.${sessionId}`,
      }, () => { void refresh() })
      .subscribe((status) => {
        if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          setError('Live chat updates disconnected. Retry by refreshing this class.')
        }
      })
    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [sessionId])

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy || !body.trim()) return
    setBusy(true)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('send_classroom_message', {
        target_session_id: sessionId,
        message_body: body,
      })
      if (rpcError) throw new Error(rpcError.message)
      setBody('')
      setMessages(await listClassroomMessages(sessionId))
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not send this message.'))
    } finally {
      setBusy(false)
    }
  }

  const names = new Map(roster.map((member) => [member.user_id, member.display_name]))
  return <section className="classroom-panel conversation-panel">
    <div className="panel-heading"><div><div className="eyebrow">CLASSROOM CHAT</div><h2>Class discussion</h2></div><span className="panel-count">{messages.length}</span></div>
    <div aria-live="polite" className="class-chat-history" role="log">
      {messages.length === 0 ? <p className="panel-empty">No class chat messages yet. Start the discussion with a question or note.</p> : messages.map((message) => <article className={message.user_id === userId ? 'class-chat-message is-mine' : 'class-chat-message'} key={message.id}>
        <div><strong>{names.get(message.user_id) ?? (message.user_id === userId ? 'You' : 'Class participant')}</strong><time dateTime={message.created_at}>{new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(message.created_at))}</time></div>
        <p>{message.body}</p>
      </article>)}
    </div>
    {isLive && <form className="class-interaction-form" onSubmit={(event) => void sendMessage(event)}>
      <label className="sr-only" htmlFor={`chat-${sessionId}`}>Message the class</label>
      <textarea id={`chat-${sessionId}`} maxLength={2000} onChange={(event) => setBody(event.target.value)} placeholder="Message everyone in this classroom…" rows={2} value={body} />
      <button className="button button-dark" disabled={busy || !body.trim()} type="submit">{busy ? 'Sending…' : 'Send'}</button>
    </form>}
    <p className="field-note">{isLive ? 'Class chat is visible to authorized participants and is not private messaging.' : 'This class has ended. The saved chat is read-only.'}</p>
    {error && <p className="form-message form-error" role="alert">{error}</p>}
  </section>
}

export function ClassroomQuestionsPanel({
  sessionId,
  userId,
  canModerate,
  roster,
  isLive,
}: {
  sessionId: string
  userId: string
  canModerate: boolean
  roster: ClassroomRosterMember[]
  isLive: boolean
}) {
  const [questions, setQuestions] = useState<ClassroomQuestion[]>([])
  const [question, setQuestion] = useState('')
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    async function refresh() {
      try {
        const items = await listClassroomQuestions(sessionId)
        if (active) {
          setQuestions(items)
          setError('')
        }
      } catch (cause) {
        if (active) setError(getErrorMessage(cause, 'Could not load classroom questions.'))
      }
    }
    void refresh()
    const channel = client
      .channel(`classroom-questions-${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'classroom_questions',
        filter: `session_id=eq.${sessionId}`,
      }, () => { void refresh() })
      .subscribe((status) => {
        if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          setError('Live question updates disconnected. Refresh to reload questions.')
        }
      })
    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [sessionId])

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busyId || !question.trim()) return
    setBusyId('submit')
    setError('')
    setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc('submit_classroom_question', {
        target_session_id: sessionId,
        question_body: question,
      })
      if (rpcError) throw new Error(rpcError.message)
      setQuestion('')
      setNotice('Your question was shared with the class.')
      setQuestions(await listClassroomQuestions(sessionId))
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not submit this question.'))
    } finally {
      setBusyId('')
    }
  }

  async function updateQuestion(item: ClassroomQuestion) {
    if (!supabase || busyId) return
    const answer = responses[item.id]?.trim() ?? ''
    const nextStatus = item.status === 'answered' ? 'open' : 'answered'
    if (nextStatus === 'answered' && !answer) {
      setError('Write a response before marking this question answered.')
      return
    }
    setBusyId(item.id)
    setError('')
    setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc('update_classroom_question', {
        target_question_id: item.id,
        new_status: nextStatus,
        instructor_response: nextStatus === 'answered' ? answer : null,
      })
      if (rpcError) throw new Error(rpcError.message)
      setQuestions(await listClassroomQuestions(sessionId))
      setResponses((current) => ({ ...current, [item.id]: '' }))
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not update this question.'))
    } finally {
      setBusyId('')
    }
  }

  const names = new Map(roster.map((member) => [member.user_id, member.display_name]))
  return <section className="classroom-panel conversation-panel">
    <div className="panel-heading"><div><div className="eyebrow">ASK THE INSTRUCTOR</div><h2>Questions</h2></div><span className="panel-count">{questions.filter((item) => item.status === 'open').length} open</span></div>
    {!canModerate && isLive && <form className="class-interaction-form question-submit-form" onSubmit={(event) => void submitQuestion(event)}>
      <label className="sr-only" htmlFor={`question-${sessionId}`}>Submit a question</label>
      <textarea id={`question-${sessionId}`} maxLength={1200} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question about what you are building…" rows={2} value={question} />
      <button className="button button-dark" disabled={busyId === 'submit' || !question.trim()} type="submit">{busyId === 'submit' ? 'Submitting…' : 'Ask question'}</button>
    </form>}
    <div className="class-question-list" aria-live="polite">
      {questions.length === 0 ? <p className="panel-empty">No questions have been submitted yet.</p> : questions.map((item) => <article className="class-question" key={item.id}>
        <div className="class-question-meta"><strong>{names.get(item.user_id) ?? (item.user_id === userId ? 'You' : 'Class participant')}</strong><time dateTime={item.created_at}>{new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(item.created_at))}</time><span className={`request-state state-${item.status}`}>{item.status}</span></div>
        <p>{item.question}</p>
        {item.response && <div className="class-question-response"><strong>Instructor response</strong><p>{item.response}</p></div>}
        {canModerate && <div className="question-moderation">
          {item.status === 'open' && <label>Instructor response<textarea maxLength={1200} onChange={(event) => setResponses((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Write an answer for everyone in this class…" rows={2} value={responses[item.id] ?? ''} /></label>}
          <button className="button button-outline button-small" disabled={busyId === item.id || (item.status === 'open' && !responses[item.id]?.trim())} onClick={() => void updateQuestion(item)} type="button">
            {busyId === item.id ? 'Saving…' : item.status === 'answered' ? 'Reopen question' : 'Mark answered'}
          </button>
        </div>}
      </article>)}
    </div>
    {!isLive && <p className="field-note">This class has ended. Saved questions remain available to authorized participants.</p>}
    {notice && <p className="form-message form-success" role="status">{notice}</p>}
    {error && <p className="form-message form-error" role="alert">{error}</p>}
  </section>
}
