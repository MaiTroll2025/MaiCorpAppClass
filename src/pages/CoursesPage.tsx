
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  getPublishedCourse,
  listPublishedCourses,
  type CourseDetail,
  type CourseSummary,
} from '../lib/courses'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { EmptyState, SetupNotice } from './Shared'

export function CoursesPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [level, setLevel] = useState('all')

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    let active = true

    void listPublishedCourses()
      .then((result) => {
        if (active) {
          setCourses(result)
          setError('')
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'We could not load the course library. Please try again.',
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const categories = useMemo(
    () =>
      [
        ...new Set(
          courses
            .map((course) => course.category?.name)
            .filter((name): name is string => Boolean(name)),
        ),
      ].sort(),
    [courses],
  )

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    return courses.filter((course) => {
      const searchableText = [
        course.title,
        course.description,
        course.category?.name ?? '',
        course.instructor?.display_name ?? '',
        course.level,
      ]
        .join(' ')
        .toLowerCase()

      return (
        searchableText.includes(query) &&
        (category === 'all' || course.category?.name === category) &&
        (level === 'all' || course.level?.toLowerCase() === level)
      )
    })
  }, [category, courses, level, search])

  function clearFilters() {
    setSearch('')
    setCategory('all')
    setLevel('all')
  }

  return (
    <div className="page-shell">
      <section className="page-hero courses-hero">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          YOUR LEARNING STARTS HERE
        </div>

        <h1>
          Have an idea?
          <br />
          <span>Learn how to build it.</span>
        </h1>

        <p>
          Whether you have never written a line of code or you are ready
          to build something more advanced, start with a topic that
          interests you. Learn how applications work, explore the tools
          developers use, and build your skills one step at a time.
        </p>

        <div className="courses-hero-actions">
          <a className="button button-dark" href="#course-library">
            Explore courses <span aria-hidden="true">↓</span>
          </a>

          <Link className="button button-secondary" to="/how-it-works">
            How it works
          </Link>
        </div>
      </section>

      <section className="section courses-intro">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          LEARN AT YOUR LEVEL
        </div>

        <h2>You don't have to know everything to get started.</h2>

        <p>
          Start with the basics, learn how the different parts of an
          application fit together, and practice as you go. You can
          explore topics such as VS Code, AI-assisted coding, frontend
          development, databases, APIs, and deploying an app online.
          Available subjects depend on the courses published in our
          library.
        </p>
      </section>

      <section className="section catalog-section" id="course-library">
        <div className="catalog-heading">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              THE COURSE LIBRARY
            </div>
            <h2>Find your next learning step.</h2>
            <p>
              Search by topic, browse categories, or choose a difficulty
              level to find a course that fits your goals.
            </p>
          </div>
        </div>

        <div className="catalog-toolbar">
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Search courses</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Try Supabase, AI coding, or app development"
              type="search"
            />
          </label>

          <label className="filter-field">
            <span className="sr-only">Filter by category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="all">All topics</option>
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span className="sr-only">Filter by level</span>
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            >
              <option value="all">All levels</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
        </div>

        {!isSupabaseConfigured ? (
          <SetupNotice />
        ) : loading ? (
          <div className="inline-state" role="status" aria-live="polite">
            Loading published courses…
          </div>
        ) : error ? (
          <div className="inline-state error-state" role="alert">
            <p>{error}</p>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        ) : filtered.length > 0 ? (
          <>
            <div className="results-count" aria-live="polite">
              Showing {filtered.length}{' '}
              {filtered.length === 1 ? 'course' : 'courses'}
              {search.trim() ? ` matching "${search.trim()}"` : ''}
            </div>

            <div className="course-grid">
              {filtered.map((course, index) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  index={index}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="catalog-empty">
            <EmptyState
              title={
                courses.length
                  ? 'No courses match your search.'
                  : 'New learning opportunities are on the way.'
              }
              text={
                courses.length
                  ? 'Try a different keyword or clear your filters to see all published courses.'
                  : 'There are no published courses available right now. Check back when new lessons are released.'
              }
            />

            {courses.length > 0 && (
              <button
                type="button"
                className="button button-secondary"
                onClick={clearFilters}
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </section>

      <section className="section courses-help">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            NOT SURE WHERE TO BEGIN?
          </div>

          <h2>Start with the basics. Build from there.</h2>

          <p>
            Learn how the process works before worrying about advanced
            code. Our beginner resources explain the tools and concepts
            you will encounter as you start creating applications.
          </p>
        </div>

        <div className="courses-help-actions">
          <Link className="button button-dark" to="/how-it-works">
            See how learning works <span aria-hidden="true">↗</span>
          </Link>

          <Link className="button button-secondary" to="/pricing">
            Explore learning plans
          </Link>
        </div>
      </section>
    </div>
  )
}

export function CourseCard({
  course,
  index,
}: {
  course: CourseSummary
  index: number
}) {
  return (
    <Link
      className={`course-card tone-${index % 3}`}
      to={`/courses/${course.slug}`}
    >
      <div className="course-art">
        {course.thumbnail_url ? (
          <img
            alt=""
            loading="lazy"
            src={course.thumbnail_url}
          />
        ) : (
          <div className="course-art-pattern" aria-hidden="true">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <i>✳</i>
          </div>
        )}

        <span className="course-level">
          {formatLevel(course.level)}
        </span>

        <span className="course-open" aria-hidden="true">
          ↗
        </span>
      </div>

      <div className="course-card-body">
        <div className="course-meta">
          <span>
            {course.category?.name ?? 'Software development'}
          </span>
          <span>
            {course.lessons.length}{' '}
            {course.lessons.length === 1 ? 'lesson' : 'lessons'}
          </span>
        </div>

        <h3>{course.title}</h3>

        <p>{course.description}</p>

        <div className="course-card-foot">
          <span>
            By {course.instructor?.display_name ?? 'Mai Corp instructor'}
          </span>
          <span>{formatDuration(course.estimated_minutes)}</span>
        </div>

        <span className="course-card-link">
          Explore course <span aria-hidden="true">↗</span>
        </span>
      </div>
    </Link>
  )
}

function formatLevel(level: string) {
  if (!level) return 'All levels'

  return level.charAt(0).toUpperCase() + level.slice(1).toLowerCase()
}

function formatDuration(minutes: number | null) {
  if (!minutes || minutes < 1) return 'Self-paced'

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (!hours) return `${remainingMinutes} min`

  return remainingMinutes
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`
}

export function CoursePage() {
  const { slug = '' } = useParams()
  const { user } = useAuth()

  const [result, setResult] = useState<{
    slug: string
    course: CourseDetail | null
    error?: string
  } | null>(null)

  const [loading, setLoading] = useState(true)
  const [promptFeedback, setPromptFeedback] = useState<{
    text: string
    fallback: boolean
  } | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    let active = true

    setLoading(true)
    setResult(null)

    void getPublishedCourse(slug)
      .then((course) => {
        if (active) {
          setResult({ slug, course })
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setResult({
            slug,
            course: null,
            error:
              cause instanceof Error
                ? cause.message
                : 'We could not load this course. Please try again.',
          })
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [slug])

  if (!isSupabaseConfigured) {
    return (
      <div className="section page-state">
        <SetupNotice />
      </div>
    )
  }

  if (loading || !result || result.slug !== slug) {
    return (
      <div className="section page-state" role="status" aria-live="polite">
        Loading course details…
      </div>
    )
  }

  if (result.error) {
    return (
      <div className="section page-state">
        <div className="inline-state error-state" role="alert">
          {result.error}
        </div>
        <Link className="button button-dark" to="/courses">
          Browse courses
        </Link>
      </div>
    )
  }

  const course = result.course

  if (!course) {
    return (
      <div className="section page-state">
        <EmptyState
          title="We couldn't find that course."
          text="It may have moved, or it may not be published yet."
        />
        <Link className="button button-dark" to="/courses">
          Browse courses
        </Link>
      </div>
    )
  }

  const loadedCourse = course

  async function copyLessonPrompt(lesson: CourseDetail['lessons'][number]) {
    if (loadedCourse.access_level !== 'free' && !lesson.is_preview) {
      if (!user || !supabase) {
        setPromptFeedback({
          text: 'Sign in and enroll in this course to copy prompts for its full lessons.',
          fallback: false,
        })
        return
      }
      const { data: enrollment, error: enrollmentError } = await supabase
        .from('enrollments')
        .select('id')
        .eq('user_id', user.id)
        .eq('course_id', loadedCourse.id)
        .in('status', ['active', 'completed'])
        .maybeSingle()
      if (enrollmentError || !enrollment) {
        setPromptFeedback({
          text: enrollmentError
            ? 'Could not verify course access. Please retry or contact platform support.'
            : 'Your account does not currently have access to this lesson prompt.',
          fallback: false,
        })
        return
      }
    }

    const prompt = [
      `# Lesson: ${lesson.title}`,
      '',
      '## Learning objective',
      lesson.description || loadedCourse.learning_objectives.join('\n') || 'Learn the concepts and complete the lesson exercise.',
      '',
      '## Project prerequisites',
      ...(loadedCourse.prerequisites.length
        ? loadedCourse.prerequisites.map((item) => `- ${item}`)
        : ['- Open the project supplied for this lesson.']),
      '',
      '## Starting files',
      '- Inspect the existing project and identify relevant files before editing.',
      '- Preserve unrelated user changes and do not assume the repository is empty.',
      '',
      '## Task',
      lesson.description || `Complete the lesson "${lesson.title}" for ${loadedCourse.title}.`,
      '',
      '## Constraints and security requirements',
      '- Use placeholders only; do not reveal or copy values from environment files.',
      '- Keep server-only secrets out of browser code and respect the project’s RLS policies.',
      '- Do not run destructive commands, migrations, commits, or deployments without explicit approval.',
      '- Explain proposed changes and ask before making consequential edits.',
      '',
      '## Expected output and completion criteria',
      `- Complete the exercise for "${lesson.title}" and explain the key implementation decisions.`,
      '- Follow any acceptance criteria or test commands provided by the instructor for this lesson.',
      '- Inspect the final diff and report changed files, tests run, and checks that could not run.',
      '',
      '## Troubleshooting',
      '- If a command or test fails, explain the error and inspect relevant files before proposing a fix.',
      '- Do not hide failures or claim success without verifying the result.',
    ].join('\n')

    try {
      await navigator.clipboard.writeText(prompt)
      setPromptFeedback({
        text: 'Lesson prompt copied. Paste it into Kilo’s supported chat interface and review its suggestions.',
        fallback: false,
      })
    } catch {
      setPromptFeedback({ text: prompt, fallback: true })
    }
  }

  return (
    <div className="course-detail">
      <div className="course-detail-hero">
        <div className="section course-detail-inner">
          <Link className="back-link" to="/courses">
            ← All courses
          </Link>

          <div className="eyebrow">
            <span className="eyebrow-dot" />
            {course.category?.name ?? 'Software development'}
          </div>

          <h1>{course.title}</h1>

          <p className="detail-description">{course.description}</p>

          <div className="detail-meta">
            <span>{formatLevel(course.level)}</span>
            <span>
              {course.lessons.length}{' '}
              {course.lessons.length === 1 ? 'lesson' : 'lessons'}
            </span>
            <span>{formatDuration(course.estimated_minutes)}</span>
            <span>
              By {course.instructor?.display_name ?? 'Mai Corp instructor'}
            </span>
          </div>
        </div>
      </div>

      <div className="section detail-content">
        <div className="curriculum">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            YOUR LEARNING PATH
          </div>

          <h2>What you'll learn</h2>

          <p className="curriculum-intro">
            Explore the topics covered in this course and see how each
            lesson contributes to your learning journey.
          </p>

          {course.learning_objectives.length > 0 && (
            <ul className="objective-list">
              {course.learning_objectives.map((objective) => (
                <li key={objective}>
                  <span aria-hidden="true">✓</span>
                  {objective}
                </li>
              ))}
            </ul>
          )}

          <h3 className="lesson-list-heading">Course lessons</h3>

          {course.lessons.length > 0 ? (
            <div className="lesson-list">
              {course.lessons.map((lesson, index) => (
                <article className="lesson-row" key={lesson.id}>
                  <span className="lesson-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <div className="lesson-row-content">
                    <h3>{lesson.title}</h3>
                    {lesson.description && <p>{lesson.description}</p>}
                  </div>

                  <div className="lesson-actions">
                    <span className="lesson-access">
                      {lesson.is_preview ? 'Preview' : 'Included lesson'}
                    </span>
                    <button
                      className="button button-outline button-small"
                      onClick={() => void copyLessonPrompt(lesson)}
                      type="button"
                    >
                      Copy prompt
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p>
              Lesson details are being prepared for this course.
            </p>
          )}
          {promptFeedback && (
            <div className="prompt-feedback" role={promptFeedback.fallback ? 'alert' : 'status'}>
              {promptFeedback.fallback ? (
                <>
                  <p>
                    Clipboard access was unavailable. Select and copy the prompt below.
                    It contains lesson instructions only, not project files or credentials.
                  </p>
                  <textarea aria-label="Lesson prompt to copy manually" readOnly value={promptFeedback.text} />
                </>
              ) : (
                <p>{promptFeedback.text}</p>
              )}
            </div>
          )}
        </div>

        <aside className="enroll-card">
          <div className="enroll-symbol" aria-hidden="true">
            ✳
          </div>

          <h2>Ready to start learning?</h2>

          <p>
            Create your account to get started. Your available course
            access depends on your purchased plan and enrollment.
          </p>

          <Link
            className="button button-dark button-full"
            to="/sign-up"
          >
            Create your account <span aria-hidden="true">↗</span>
          </Link>

          <Link
            className="button button-secondary button-full"
            to="/pricing"
          >
            View learning plans
          </Link>

          <p className="enroll-note">
            Check the plan details before purchasing to understand
            which classes, training sessions, and support services
            are included.
          </p>
        </aside>
      </div>
    </div>
  )
}
