import { supabase } from './supabase'

export interface CourseSummary {
  id: string
  slug: string
  title: string
  description: string
  thumbnail_url: string | null
  level: string
  estimated_minutes: number | null
  learning_objectives: string[]
  access_level: string
  instructor: { display_name: string | null } | null
  category: { name: string } | null
  lessons: { id: string }[]
}

export interface CourseDetail extends CourseSummary {
  prerequisites: string[]
  instructor_id: string
  lessons: {
    id: string
    title: string
    description: string | null
    order_index: number
    is_preview: boolean
  }[]
}

const courseFields =
  'id, slug, title, description, thumbnail_url, level, estimated_minutes, learning_objectives, access_level, instructor:profiles!courses_instructor_id_fkey(display_name), category:categories(name), lessons(id)'

export async function listPublishedCourses(): Promise<CourseSummary[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('courses')
    .select(courseFields)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(60)

  if (error) throw new Error(`Could not load courses: ${error.message}`)
  return (data ?? []) as unknown as CourseSummary[]
}

export async function getPublishedCourse(slug: string): Promise<CourseDetail | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('courses')
    .select(
      'id, slug, title, description, thumbnail_url, level, estimated_minutes, learning_objectives, prerequisites, access_level, instructor_id, instructor:profiles!courses_instructor_id_fkey(display_name), category:categories(name), lessons(id, title, description, order_index, is_preview)',
    )
    .eq('slug', slug)
    .eq('status', 'published')
    .order('order_index', { referencedTable: 'lessons', ascending: true })
    .maybeSingle()

  if (error) throw new Error(`Could not load this course: ${error.message}`)
  return data as unknown as CourseDetail | null
}
