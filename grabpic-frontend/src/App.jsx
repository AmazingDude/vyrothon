import { useEffect, useMemo, useRef, useState } from 'react'

const API_BASE = 'http://localhost:3000'

function App() {
  const [apiOnline, setApiOnline] = useState(false)
  const [crawlLoading, setCrawlLoading] = useState(false)
  const [crawlResult, setCrawlResult] = useState(null)

  const [selfieLoading, setSelfieLoading] = useState(false)
  const [selfieFile, setSelfieFile] = useState(null)
  const [selfiePreview, setSelfiePreview] = useState('')
  const [selfieResult, setSelfieResult] = useState(null)

  const [photosLoading, setPhotosLoading] = useState(false)
  const [grabIdInput, setGrabIdInput] = useState('')
  const [photos, setPhotos] = useState([])

  const [toasts, setToasts] = useState([])
  const fileRef = useRef(null)

  const apiBadgeClass = useMemo(
    () => (apiOnline ? 'status status-online' : 'status status-offline'),
    [apiOnline],
  )

  useEffect(() => {
    let mounted = true

    const checkApi = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`, { method: 'GET' })
        if (mounted) {
          setApiOnline(res.ok)
        }
      } catch {
        if (mounted) {
          setApiOnline(false)
        }
      }
    }

    checkApi()
    const timer = window.setInterval(checkApi, 10000)

    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  const showToast = (message, type = 'success') => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, message, type }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 3000)
  }

  const getErrorMessage = async (res, fallback) => {
    try {
      const data = await res.json()
      return data.message || data.error || fallback
    } catch {
      return fallback
    }
  }

  const handleCrawl = async () => {
    setCrawlLoading(true)
    setCrawlResult(null)

    try {
      const res = await fetch(`${API_BASE}/admin/crawl`, { method: 'POST' })
      if (!res.ok) {
        const msg = await getErrorMessage(res, 'Failed to crawl and index faces.')
        throw new Error(msg)
      }

      const data = await res.json()
      setCrawlResult({
        totalImages: data.totalImages ?? 0,
        totalFacesDetected: data.totalFacesDetected ?? 0,
        newFacesAdded: data.newFacesAdded ?? 0,
        processingTime: data.processingTime ?? 'N/A',
      })
      showToast('Crawling completed successfully.')
    } catch (error) {
      showToast(error.message || 'Crawl request failed.', 'error')
    } finally {
      setCrawlLoading(false)
    }
  }

  const applySelfieFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please upload a valid image file.', 'error')
      return
    }

    setSelfieFile(file)
    setSelfieResult(null)
    setPhotos([])
    setSelfiePreview(URL.createObjectURL(file))
  }

  const onDrop = (event) => {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    applySelfieFile(file)
  }

  const handleSelfieSubmit = async (event) => {
    event.preventDefault()

    if (!selfieFile) {
      showToast('Upload a selfie before searching.', 'error')
      return
    }

    setSelfieLoading(true)
    setSelfieResult(null)

    try {
      const formData = new FormData()
      formData.append('image', selfieFile)

      const res = await fetch(`${API_BASE}/auth/selfie`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const msg = await getErrorMessage(res, 'Selfie authentication failed.')
        throw new Error(msg)
      }

      const data = await res.json()
      const confidenceValue = Number(data.confidence ?? 0)
      const normalizedConfidence = confidenceValue <= 1
        ? confidenceValue * 100
        : confidenceValue

      const result = {
        grabId: data.grabId || '',
        confidence: normalizedConfidence,
        error: data.error || '',
        success: Boolean(data.success ?? data.grabId),
      }

      setSelfieResult(result)

      if (!result.success) {
        showToast(result.error || 'No matching face found.', 'error')
        return
      }

      if (result.grabId) {
        setGrabIdInput(result.grabId)
        await fetchPhotos(result.grabId)
      }

      showToast('Authentication succeeded.', 'success')
    } catch (error) {
      showToast(error.message || 'Selfie authentication failed.', 'error')
    } finally {
      setSelfieLoading(false)
    }
  }

  const resolveImageUrl = (value) => {
    if (!value) {
      return ''
    }

    if (/^https?:\/\//i.test(value)) {
      return value
    }

    const normalized = value.startsWith('/') ? value : `/${value}`
    return `${API_BASE}${normalized}`
  }

  const fetchPhotos = async (grabIdOverride) => {
    const idToUse = (grabIdOverride || grabIdInput).trim()
    if (!idToUse) {
      showToast('Please enter a grabId.', 'error')
      return
    }

    setPhotosLoading(true)
    setPhotos([])

    try {
      const res = await fetch(`${API_BASE}/images/${encodeURIComponent(idToUse)}`)
      if (!res.ok) {
        const msg = await getErrorMessage(res, 'Failed to fetch images.')
        throw new Error(msg)
      }

      const data = await res.json()
      const rawList = Array.isArray(data)
        ? data
        : Array.isArray(data.images)
          ? data.images
          : []

      const list = rawList
        .map((entry) => (typeof entry === 'string' ? entry : entry?.filePath))
        .filter(Boolean)

      setPhotos(list)
      showToast(`Loaded ${list.length} image${list.length === 1 ? '' : 's'}.`)
    } catch (error) {
      showToast(error.message || 'Failed to fetch images.', 'error')
    } finally {
      setPhotosLoading(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <header className="header card">
        <div>
          <h1>Grabpic</h1>
          <p>Intelligent Identity & Retrieval Engine</p>
        </div>
        <div className={apiBadgeClass}>
          <span className="status-dot" />
          {apiOnline ? 'API Online' : 'API Offline'}
        </div>
      </header>

      <main className="content">
        <section className="card section">
          <h2>Crawl &amp; Index Faces</h2>
          <button
            className="btn btn-primary"
            type="button"
            disabled={crawlLoading}
            onClick={handleCrawl}
          >
            {crawlLoading ? <span className="spinner" aria-hidden="true" /> : null}
            {crawlLoading ? 'Starting Crawl...' : 'Start Crawling'}
          </button>

          {crawlResult ? (
            <div className="result-grid">
              <div className="result-item"><span>Total Images</span><strong>{crawlResult.totalImages}</strong></div>
              <div className="result-item"><span>Total Faces Detected</span><strong>{crawlResult.totalFacesDetected}</strong></div>
              <div className="result-item"><span>New Faces Added</span><strong>{crawlResult.newFacesAdded}</strong></div>
              <div className="result-item"><span>Processing Time</span><strong>{crawlResult.processingTime}</strong></div>
            </div>
          ) : null}
        </section>

        <section className="card section">
          <h2>Selfie Authentication</h2>
          <form onSubmit={handleSelfieSubmit}>
            <div
              className="dropzone"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  fileRef.current?.click()
                }
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => applySelfieFile(e.target.files?.[0])}
              />
              {selfiePreview ? (
                <img src={selfiePreview} alt="Selfie preview" className="preview" />
              ) : (
                <p>Drag and drop an image here, or click to upload.</p>
              )}
            </div>

            <button className="btn btn-primary" type="submit" disabled={selfieLoading}>
              {selfieLoading ? <span className="spinner" aria-hidden="true" /> : null}
              {selfieLoading ? 'Matching Face...' : 'Find My Photos'}
            </button>
          </form>

          {selfieResult ? (
            <div className="auth-result">
              <div><span>grabId</span><strong>{selfieResult.grabId || 'N/A'}</strong></div>
              <div><span>Confidence</span><strong>{selfieResult.confidence.toFixed(2)}%</strong></div>
              <div className={`badge ${selfieResult.success ? 'badge-success' : 'badge-failure'}`}>
                {selfieResult.success ? 'Success' : 'Failure'}
              </div>
            </div>
          ) : null}
        </section>

        <section className="card section">
          <h2>My Photos</h2>
          <div className="row">
            <input
              type="text"
              value={grabIdInput}
              onChange={(e) => setGrabIdInput(e.target.value)}
              placeholder="Enter grabId"
            />
            <button
              className="btn btn-secondary"
              type="button"
              disabled={photosLoading}
              onClick={() => fetchPhotos()}
            >
              {photosLoading ? <span className="spinner" aria-hidden="true" /> : null}
              {photosLoading ? 'Fetching...' : 'Fetch Images'}
            </button>
          </div>

          {photos.length > 0 ? (
            <div className="photo-grid">
              {photos.map((photo, index) => (
                <a
                  key={`${photo}-${index}`}
                  href={resolveImageUrl(photo)}
                  target="_blank"
                  rel="noreferrer"
                  className="photo-card"
                >
                  <img src={resolveImageUrl(photo)} alt={`Match ${index + 1}`} loading="lazy" />
                  <span>{photo}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="muted">No images loaded yet.</p>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
