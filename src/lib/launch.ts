import { supabase } from './supabase'

export interface PublicLaunchStats {
  enrolledStudents: number
  launchAt: string | null
}

export async function getPublicLaunchStats(): Promise<PublicLaunchStats> {
  if (!supabase) throw new Error('Public enrollment information is unavailable.')

  const { data, error } = await supabase.rpc('get_public_launch_stats')
  if (error) throw new Error('Could not load live launch information. Please try again later.')

  const result = Array.isArray(data) ? data[0] : data
  if (!result || typeof result !== 'object') {
    throw new Error('Live launch information is not available.')
  }

  const stats = result as { enrolled_students?: unknown; public_launch_at?: unknown }
  const enrolledStudents = Number(stats.enrolled_students)
  if (!Number.isSafeInteger(enrolledStudents) || enrolledStudents < 0) {
    throw new Error('The confirmed enrollment count could not be verified.')
  }
  if (stats.public_launch_at !== null && typeof stats.public_launch_at !== 'string') {
    throw new Error('The official launch date could not be verified.')
  }
  if (typeof stats.public_launch_at === 'string' && Number.isNaN(Date.parse(stats.public_launch_at))) {
    throw new Error('The official launch date could not be verified.')
  }

  return {
    enrolledStudents,
    launchAt: stats.public_launch_at as string | null,
  }
}

export async function setPublicLaunchAt(launchAt: string | null) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.rpc('set_public_launch_at', {
    new_launch_at: launchAt,
  })
  if (error) throw new Error('Could not save the official launch date. Confirm administrator access and try again.')
}
