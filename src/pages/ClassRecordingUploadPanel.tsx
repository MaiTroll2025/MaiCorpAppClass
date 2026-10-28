import { useEffect, useState, type ChangeEvent } from 'react'
import { supabase } from '../lib/supabase'

interface RecordingRow {
  id: string
  storage_path: string | null
  status: string
  published_at: string | null
}

export function ClassRecordingUploadPanel({ sessionId }: { sessionId: string }) {
  const [recording, setRecording] = useState<RecordingRow | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [publishWhenUploaded, setPublishWhenUploaded] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.from('recordings')
      .select('id, storage_path, status, published_at')
      .eq('session_id', sessionId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setMessage(`Could not load recording status: ${error.message}`)
        else setRecording(data)
      })
    return () => { active = false }
  }, [sessionId])

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setSelectedFile(file)
    setMessage('')
    if (file && (!/\.(mp4|webm)$/i.test(file.name) || file.size > 50_000_000)) {
      setSelectedFile(null)
      setMessage('Choose an MP4 or WebM recording smaller than 50 MB.')
    }
  }

  async function uploadRecording() {
    if (!supabase || !selectedFile || busy) return
    setBusy(true)
    setMessage('')
    const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-180)
    const path = `${sessionId}/${crypto.randomUUID()}-${safeName}`
    try {
      const { error: uploadError } = await supabase.storage
        .from('class-recordings')
        .upload(path, selectedFile, {
          contentType: selectedFile.type || (selectedFile.name.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4'),
          upsert: false,
        })
      if (uploadError) throw new Error(`Could not upload the recording: ${uploadError.message}`)

      const { data, error: metadataError } = await supabase
        .from('recordings')
        .upsert({
          session_id: sessionId,
          storage_path: path,
          status: 'ready',
          published_at: publishWhenUploaded ? new Date().toISOString() : null,
        }, { onConflict: 'session_id' })
        .select('id, storage_path, status, published_at')
        .single()
      if (metadataError) {
        const { error: cleanupError } = await supabase.storage.from('class-recordings').remove([path])
        if (cleanupError) {
          throw new Error(`Recording details could not be saved: ${metadataError.message}. The uploaded file also could not be removed: ${cleanupError.message}`)
        }
        throw new Error(`Recording details could not be saved: ${metadataError.message}`)
      }

      setRecording(data)
      setSelectedFile(null)
      setMessage(publishWhenUploaded
        ? 'Recording uploaded and published to the public library.'
        : 'Recording uploaded as unpublished. Publish it when it is ready for viewers.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not upload this recording.')
    } finally {
      setBusy(false)
    }
  }

  async function togglePublished() {
    if (!supabase || !recording || busy) return
    setBusy(true)
    setMessage('')
    try {
      const nextPublishedAt = recording.published_at ? null : new Date().toISOString()
      const { data, error } = await supabase
        .from('recordings')
        .update({ published_at: nextPublishedAt })
        .eq('id', recording.id)
        .select('id, storage_path, status, published_at')
        .maybeSingle()
      if (error) throw new Error(`Could not update recording visibility: ${error.message}`)
      if (!data) throw new Error('Recording visibility was not updated.')
      setRecording(data)
      setMessage(nextPublishedAt ? 'Recording published to the public library.' : 'Recording removed from the public library.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not update recording visibility.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="classroom-panel recording-upload-panel">
    <div className="eyebrow">PRERECORDED CLASS</div>
    <h2>Recording library</h2>
    <p>Upload an MP4 or WebM file up to 50 MB to the private recording bucket. Viewers receive a temporary signed link after their access check.</p>
    {recording?.storage_path && <p className="provider-notice">{recording.published_at ? 'Published in the public recording library.' : 'Uploaded but not published.'}</p>}
    <label className="recording-file-label">Choose recording<input accept="video/mp4,video/webm,.mp4,.webm" onChange={chooseFile} type="file" /></label>
    {selectedFile && <p className="dashboard-note">{selectedFile.name} · {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</p>}
    <label className="recording-publish-choice"><input checked={publishWhenUploaded} onChange={(event) => setPublishWhenUploaded(event.target.checked)} type="checkbox" /> Publish to the public library after upload</label>
    <div className="dashboard-class-setup-actions">
      <button className="button button-dark" disabled={busy || !selectedFile} onClick={() => void uploadRecording()} type="button">{busy ? 'Uploading…' : 'Upload recording'}</button>
      {recording?.storage_path && <button className="button button-outline" disabled={busy} onClick={() => void togglePublished()} type="button">{recording.published_at ? 'Unpublish recording' : 'Publish recording'}</button>}
    </div>
    {message && <p className="form-message" role="status">{message}</p>}
  </section>
}
