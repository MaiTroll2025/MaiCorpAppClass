import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { supabase } from '../../lib/supabase'

interface CourseForm {
  title: string
  slug: string
  description: string
  category_id: string
  level: string
  estimated_minutes: string
  learning_objectives: string[]
  prerequisites: string[]
  access_level: string
  required_plan_id: string | null
  instructor_id: string
  status: string
}

interface LessonForm {
  id?: string
  title: string
  description: string
  content_markdown: string
  lesson_type: string
  is_preview: boolean
  order_index: number
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function CourseEditor() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const courseId = searchParams.get('id')
  const { user } = useAuth()

  const [course, setCourse] = useState<CourseForm>({
    title: '',
    slug: '',
    description: '',
    category_id: '',
    level: 'beginner',
    estimated_minutes: '',
    learning_objectives: [''],
    prerequisites: [''],
    access_level: 'free',
    required_plan_id: null,
    instructor_id: user?.id || '',
    status: 'draft',
  })
  const [lessons, setLessons] = useState<LessonForm[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [instructors, setInstructors] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadData = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    try {
      const [catRes, instRes] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('profiles').select('id, display_name').in('role', ['instructor', 'admin']).order('display_name'),
      ])
      setCategories(catRes.data || [])
      setInstructors(instRes.data || [])

      if (courseId) {
        const { data: courseData, error: courseError } = await supabase
          .from('courses')
          .select('*')
          .eq('id', courseId)
          .single()
        if (courseError) throw courseError
        setCourse({
          title: courseData.title || '',
          slug: courseData.slug || '',
          description: courseData.description || '',
          category_id: courseData.category_id || '',
          level: courseData.level || 'beginner',
          estimated_minutes: courseData.estimated_minutes?.toString() || '',
          learning_objectives: courseData.learning_objectives?.length ? courseData.learning_objectives : [''],
          prerequisites: courseData.prerequisites?.length ? courseData.prerequisites : [''],
          access_level: courseData.access_level || 'free',
          required_plan_id: courseData.required_plan_id || null,
          instructor_id: courseData.instructor_id || user?.id || '',
          status: courseData.status || 'draft',
        })

        const { data: lessonsData } = await supabase
          .from('lessons')
          .select('*')
          .eq('course_id', courseId)
          .order('order_index')
        setLessons((lessonsData || []).map((l, idx) => ({
          id: l.id,
          title: l.title || '',
          description: l.description || '',
          content_markdown: l.content_markdown || '',
          lesson_type: l.lesson_type || 'tutorial',
          is_preview: l.is_preview || false,
          order_index: l.order_index ?? idx,
        })))
      } else if (user) {
        setCourse(prev => ({ ...prev, instructor_id: user.id }))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [courseId, user])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function createCourseSlug(title: string) {
    if (!supabase) throw new Error('Course storage is unavailable.')

    const baseSlug = slugify(title) || `course-${crypto.randomUUID().slice(0, 8)}`

    let candidate = baseSlug
    let suffix = 2
    while (true) {
      const { data, error: lookupError } = await supabase
        .from('courses')
        .select('id')
        .eq('slug', candidate)
        .maybeSingle()
      if (lookupError) throw new Error(`Could not prepare a course URL: ${lookupError.message}`)
      if (!data) return candidate

      candidate = `${baseSlug}-${suffix}`
      suffix += 1
    }
  }

  const saveCourse = async () => {
    if (!supabase) return
    setSaving(true)
    setError('')
    setMessage('')

    try {
      if (!course.title.trim()) throw new Error('Title is required')
      if (!course.instructor_id) throw new Error('Instructor is required')

      const courseData = {
        title: course.title.trim(),
        slug: courseId ? course.slug : await createCourseSlug(course.title),
        description: course.description.trim(),
        category_id: course.category_id || null,
        level: course.level,
        estimated_minutes: course.estimated_minutes ? parseInt(course.estimated_minutes) : null,
        learning_objectives: course.learning_objectives.filter(o => o.trim()),
        prerequisites: course.prerequisites.filter(p => p.trim()),
        access_level: course.required_plan_id ? 'subscription' : course.access_level,
        required_plan_id: course.required_plan_id,
        instructor_id: course.instructor_id,
        status: course.status,
        ...(course.status === 'published' && !courseId ? { published_at: new Date().toISOString() } : {}),
      }

      let savedCourseId = courseId
      if (courseId) {
        const { error: updateError } = await supabase.from('courses').update(courseData).eq('id', courseId)
        if (updateError) throw updateError
      } else {
        const { data, error: insertError } = await supabase.from('courses').insert(courseData).select('id').single()
        if (insertError) throw insertError
        savedCourseId = data.id
      }

      // Save lessons
      for (let i = 0; i < lessons.length; i++) {
        const lesson = lessons[i]
        const lessonData = {
          course_id: savedCourseId,
          order_index: i,
          title: lesson.title.trim(),
          description: lesson.description.trim() || null,
          content_markdown: lesson.content_markdown.trim() || null,
          lesson_type: lesson.lesson_type,
          is_preview: lesson.is_preview,
          status: 'published',
        }
        if (lesson.id) {
          await supabase.from('lessons').update(lessonData).eq('id', lesson.id)
        } else {
          await supabase.from('lessons').insert(lessonData)
        }
      }

      setMessage(courseId ? 'Course updated successfully!' : 'Course created successfully!')
      if (!courseId && savedCourseId) {
        navigate(`/admin/streams/setup?courseId=${savedCourseId}`)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save course')
    } finally {
      setSaving(false)
    }
  }

  const addLesson = () => {
    setLessons([...lessons, {
      title: '',
      description: '',
      content_markdown: '',
      lesson_type: 'tutorial',
      is_preview: false,
      order_index: lessons.length,
    }])
  }

  const updateLesson = (index: number, field: string, value: any) => {
    const updated = [...lessons]
    updated[index] = { ...updated[index], [field]: value }
    setLessons(updated)
  }

  const removeLesson = async (index: number) => {
    const lesson = lessons[index]
    if (lesson.id && supabase) {
      if (confirm('Delete this lesson?')) {
        await supabase.from('lessons').delete().eq('id', lesson.id)
      } else {
        return
      }
    }
    setLessons(lessons.filter((_, i) => i !== index))
  }

  const moveLesson = (index: number, direction: 'up' | 'down') => {
    const newLessons = [...lessons]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newLessons.length) return
    [newLessons[index], newLessons[targetIndex]] = [newLessons[targetIndex], newLessons[index]]
    setLessons(newLessons)
  }

  if (loading) return <div className="admin-panel"><p>Loading...</p></div>

  return (
    <div className="admin-grid">
      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>{courseId ? 'Edit Course' : 'Create New Course'}</h2>
        </div>
        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}

        <div className="admin-form-grid">
          <label className="admin-form-field full-width">
            <span>Course Title *</span>
            <input value={course.title} onChange={(e) => setCourse({...course, title: e.target.value})} />
          </label>
          <label className="admin-form-field">
            <span>Instructor *</span>
            <select value={course.instructor_id} onChange={(e) => setCourse({...course, instructor_id: e.target.value})}>
              <option value="">Select Instructor</option>
              {instructors.map(i => <option key={i.id} value={i.id}>{i.display_name || i.id}</option>)}
            </select>
          </label>
          <label className="admin-form-field full-width">
            <span>Description</span>
            <textarea rows={4} value={course.description} onChange={(e) => setCourse({...course, description: e.target.value})} />
          </label>
          <label className="admin-form-field">
            <span>Category</span>
            <select value={course.category_id} onChange={(e) => setCourse({...course, category_id: e.target.value})}>
              <option value="">No Category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="admin-form-field">
            <span>Level</span>
            <select value={course.level} onChange={(e) => setCourse({...course, level: e.target.value})}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <label className="admin-form-field">
            <span>Estimated Minutes</span>
            <input type="number" value={course.estimated_minutes} onChange={(e) => setCourse({...course, estimated_minutes: e.target.value})} />
          </label>
          <label className="admin-form-field">
            <span>Status</span>
            <select value={course.status} onChange={(e) => setCourse({...course, status: e.target.value})}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="admin-form-field">
            <span>Access Level</span>
            <select value={course.access_level} onChange={(e) => setCourse({...course, access_level: e.target.value})}>
              <option value="free">Free</option>
              <option value="enrolled">Existing Enrollment</option>
              <option value="subscription">Subscription/Plan Required</option>
            </select>
          </label>
          <label className="admin-form-field">
            <span>Required Plan (if subscription)</span>
            <select value={course.required_plan_id || ''} onChange={(e) => setCourse({...course, required_plan_id: e.target.value || null})}>
              <option value="">None</option>
              <option value="live-learner">Live Learner</option>
              <option value="personal-builder">Personal Builder</option>
              <option value="app-support">App Support</option>
              <option value="app-portfolio">App Portfolio</option>
            </select>
          </label>
        </div>

        <div className="admin-section">
          <h3>Learning Objectives</h3>
          {course.learning_objectives.map((obj, idx) => (
            <div key={idx} className="admin-array-row">
              <input value={obj} onChange={(e) => {
                const updated = [...course.learning_objectives]
                updated[idx] = e.target.value
                setCourse({...course, learning_objectives: updated})
              }} />
              <button type="button" onClick={() => {
                setCourse({...course, learning_objectives: course.learning_objectives.filter((_, i) => i !== idx)})
              }}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => setCourse({...course, learning_objectives: [...course.learning_objectives, '']})}>+ Add Objective</button>
        </div>

        <div className="admin-section">
          <h3>Prerequisites</h3>
          {course.prerequisites.map((pre, idx) => (
            <div key={idx} className="admin-array-row">
              <input value={pre} onChange={(e) => {
                const updated = [...course.prerequisites]
                updated[idx] = e.target.value
                setCourse({...course, prerequisites: updated})
              }} />
              <button type="button" onClick={() => {
                setCourse({...course, prerequisites: course.prerequisites.filter((_, i) => i !== idx)})
              }}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => setCourse({...course, prerequisites: [...course.prerequisites, '']})}>+ Add Prerequisite</button>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Lessons</h2>
          <button className="button button-small button-dark" type="button" onClick={addLesson}>+ Add Lesson</button>
        </div>

        {lessons.length === 0 ? (
          <p>No lessons yet. Add lessons to build your course content.</p>
        ) : (
          lessons.map((lesson, idx) => (
            <div key={idx} className="admin-lesson-card">
              <div className="admin-lesson-header">
                <span>Lesson {idx + 1}</span>
                <div className="admin-lesson-actions">
                  <button type="button" onClick={() => moveLesson(idx, 'up')} disabled={idx === 0}>?</button>
                  <button type="button" onClick={() => moveLesson(idx, 'down')} disabled={idx === lessons.length - 1}>?</button>
                  <button type="button" onClick={() => removeLesson(idx)}>Delete</button>
                </div>
              </div>
              <div className="admin-form-grid">
                <label className="admin-form-field full-width">
                  <span>Lesson Title *</span>
                  <input value={lesson.title} onChange={(e) => updateLesson(idx, 'title', e.target.value)} />
                </label>
                <label className="admin-form-field">
                  <span>Lesson Type</span>
                  <select value={lesson.lesson_type} onChange={(e) => updateLesson(idx, 'lesson_type', e.target.value)}>
                    <option value="tutorial">Tutorial</option>
                    <option value="recorded">Recorded</option>
                    <option value="live">Live</option>
                    <option value="exercise">Exercise</option>
                  </select>
                </label>
                <label className="admin-form-field">
                  <span>Preview Lesson</span>
                  <select value={lesson.is_preview ? 'true' : 'false'} onChange={(e) => updateLesson(idx, 'is_preview', e.target.value === 'true')}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </label>
                <label className="admin-form-field full-width">
                  <span>Description</span>
                  <textarea rows={2} value={lesson.description} onChange={(e) => updateLesson(idx, 'description', e.target.value)} />
                </label>
                <label className="admin-form-field full-width">
                  <span>Content (Markdown)</span>
                  <textarea rows={8} value={lesson.content_markdown} onChange={(e) => updateLesson(idx, 'content_markdown', e.target.value)} placeholder="# Lesson Content&#10;&#10;Write your lesson content here..." />
                </label>
              </div>
            </div>
          ))
        )}
      </section>

      <div className="admin-actions">
        <button className="button button-dark" onClick={saveCourse} disabled={saving}>
          {saving ? 'Saving...' : courseId ? 'Update Course' : 'Create Course'}
        </button>
        <button className="button button-outline" onClick={() => navigate('/admin/courses')}>
          Cancel
        </button>
      </div>
    </div>
  )
}
