const agoraAppId = import.meta.env.VITE_AGORA_APP_ID

export const isAgoraConfigured = Boolean(agoraAppId)

export const agoraAppIdValue = agoraAppId ?? ''
