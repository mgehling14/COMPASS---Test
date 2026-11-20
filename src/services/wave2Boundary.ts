import appConfiguration from '../../power.config.json'

export const IS_WAVE2_SANDBOX = appConfiguration.appId === '77b2c86e-31b0-4dcf-a2e0-b4efd9d8ad26'
export const isWave2PreviewLocation = () => /^#\/wave2(?:\/|$)/.test(window.location.hash)
