const manifest = chrome.runtime.getManifest()
document.documentElement.setAttribute('data-potibot-extension', manifest.version_name ?? manifest.version)
