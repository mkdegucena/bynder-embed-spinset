/**
 * Bynder Embed SpinSet - Minimal embeddable 360° product viewer for Bynder Embedded Assets
 * Version: 1.0.0
 *
 * Features:
 * - Drag-to-spin interaction for 360° product viewing.
 * - Fullscreen mode with robust browser API integration.
 * - Autoplay functionality for automatic spinning.
 * - Image preloading for a smooth, lag-free experience.
 * - Scroll-to-spin interaction using mouse wheel.
 * - Customizable background color for the viewer.
 * - Supports loading images from direct URLs or Bynder media IDs.
 * - Improved performance with requestAnimationFrame.
 * - Enhanced accessibility and cleaner DOM management.
 * - Public API for better control and event handling.
 * - Improved image loading strategy to reduce 'cancelled' requests.
 * - Visual fallback for image loading errors.
 * - CSS embedded directly into JavaScript for single-line embedding.
 */
;(function (root, factory) {
	if (typeof define === 'function' && define.amd) {
		define([], factory)
	} else if (typeof module === 'object' && module.exports) {
		module.exports = factory()
	} else {
		root.BynderSpinViewer = factory()
	}
})(typeof self !== 'undefined' ? self : this, function () {
	'use strict'

	const BynderSpinViewer = {}
	const instances = [] // Stores all active viewer instances.

	// --- Constants for configuration and CSS classes ---
	const DATA_ATTR_CONTAINER = 'data-spin-container'
	const DATA_ATTR_ID = 'data-spin-id'
	const DATA_ATTR_FULLSCREEN = 'data-spin-fullscreen'
	const DATA_ATTR_SPEED = 'data-spin-speed'
	const DATA_ATTR_AUTOPLAY = 'data-spin-autoplay'
	const DATA_ATTR_PRELOAD = 'data-spin-preload'
	const DATA_ATTR_MEDIA_IDS = 'data-spin-media-id'
	const DATA_ATTR_ACCOUNT_URL = 'data-spin-account-url'
	const DATA_ATTR_IMAGE_URLS = 'data-spin-images'
	const DATA_ATTR_WIDTH = 'data-width'
	const DATA_ATTR_HEIGHT = 'data-height'
	const DATA_ATTR_SCROLL_SPIN = 'data-spin-scroll-spin'
	const DATA_ATTR_FRAMES_PER_SCROLL = 'data-spin-frames-per-scroll'
	const DATA_ATTR_BACKGROUND_COLOR = 'data-spin-background-color'

	const CLASS_VIEWER = 'bynder-spinviewer'
	const CLASS_IMAGE = 'bynder-spinviewer__image'
	const CLASS_LOADING = 'bynder-spinviewer__loading'
	const CLASS_ERROR = 'bynder-spinviewer__error'
	const CLASS_FULLSCREEN_BTN = 'bynder-spinviewer__fullscreen-btn'
	const CLASS_FULLSCREEN_ACTIVE = 'bynder-spinviewer--fullscreen'
	const CLASS_GRABBING_CURSOR = 'bynder-spinviewer--grabbing'

	const DEFAULT_SPIN_SPEED = 36 // Milliseconds per frame for autoplay
	const DEFAULT_FRAMES_PER_SCROLL = 1
	const DEFAULT_BACKGROUND_COLOR = 'transparent'
	const DRAG_SENSITIVITY = 5 // Pixels threshold for frame change
	const AUTOPLAY_RESUME_DELAY = 500 // ms after scroll inactivity

	// --- Embedded CSS String ---
	const EMBEDDED_CSS = `
        .bynder-spinviewer {
            width: 100%;
            height: 400px;
            position: relative;
            overflow: hidden;
            user-select: none;
            -webkit-user-select: none;
            -ms-user-select: none;
            -moz-user-select: none;
            touch-action: none;
            cursor: grab;
            background-color: transparent;
            font-family: sans-serif;
            box-sizing: border-box;
        }

        .bynder-spinviewer--grabbing {
            cursor: grabbing;
        }

        .bynder-spinviewer__image {
            max-width: 100%;
            max-height: 100%;
            display: block;
            user-select: none;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        .bynder-spinviewer__loading,
        .bynder-spinviewer__error {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            background-color: rgba(255, 255, 255, 0.7);
            color: #333;
            font-size: 1em;
            text-align: center;
            transition: opacity 0.3s ease-in-out;
            box-sizing: border-box;
            padding: 20px;
        }

        .bynder-spinviewer__error {
            background-color: rgba(255, 255, 255, 0.9);
            color: #D32F2F;
            display: none;
            z-index: 1002;
        }

        .bynder-spinviewer__fullscreen-btn {
            position: absolute;
            bottom: 10px;
            right: 10px;
            width: 36px;
            height: 36px;
            padding: 0;
            background: rgba(0, 0, 0, 0.4);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            z-index: 1001;
            transition: background-color 0.2s;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .bynder-spinviewer__fullscreen-btn:hover {
            background-color: rgba(0, 0, 0, 0.6);
        }

        .bynder-spinviewer__fullscreen-btn svg {
            display: block;
        }

        .bynder-spinviewer--fullscreen {
            width: 100vw !important;
            height: 100vh !important;
            max-width: 100vw !important;
            max-height: 100vh !important;
            background-color: var(--spinviewer-bg, transparent);
            display: flex;
            justify-content: center;
            align-items: center;
            top: 0;
            left: 0;
            position: fixed !important;
            z-index: 99999;
        }

        .bynder-spinviewer--fullscreen .bynder-spinviewer__image {
            object-fit: contain;
            width: 100%;
            height: 100%;
        }
    `

	// --- Fullscreen API Abstraction ---
	const fullscreenAPI = {
		enabled:
			document.fullscreenEnabled ||
			document.webkitFullscreenEnabled ||
			document.mozFullScreenEnabled ||
			document.msFullscreenEnabled,
		element: function () {
			return (
				document.fullscreenElement ||
				document.webkitFullscreenElement ||
				document.mozFullScreenElement ||
				document.msFullscreenElement
			)
		},
		request: function (el) {
			if (el.requestFullscreen) return el.requestFullscreen()
			if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen()
			if (el.mozRequestFullScreen) return el.mozRequestFullScreen()
			if (el.msRequestFullscreen) return el.msRequestFullscreen()
			return Promise.reject(new Error('Fullscreen API not supported by this browser.'))
		},
		exit: function () {
			if (document.exitFullscreen) return document.exitFullscreen()
			if (document.webkitExitFullscreen) return document.webkitExitFullscreen()
			if (document.mozCancelFullScreen) return document.mozCancelFullScreen()
			if (document.msExitFullscreen) return document.msExitFullscreen()
			return Promise.reject(new Error('Fullscreen exit API not supported by this browser.'))
		},
		eventName: function () {
			if (document.fullscreenEnabled) return 'fullscreenchange'
			if (document.webkitFullscreenEnabled) return 'webkitfullscreenchange'
			if (document.mozFullScreenEnabled) return 'mozfullscreenchange'
			if (document.msFullscreenEnabled) return 'MSFullscreenChange'
			return null
		},
	}

	// --- Utility Functions ---

	/**
	 * Injects the embedded CSS into the document's head.
	 */
	function injectStyles() {
		if (document.getElementById('bynder-spinviewer-styles')) {
			return // Styles already injected
		}
		const styleTag = document.createElement('style')
		styleTag.id = 'bynder-spinviewer-styles'
		styleTag.textContent = EMBEDDED_CSS
		document.head.appendChild(styleTag)
	}

	/**
	 * Debounces a function call to limit its execution rate.
	 * @param {function} func - The function to debounce.
	 * @param {number} wait - The delay in milliseconds before the function is executed.
	 * @returns {function} The debounced version of the function.
	 */
	function debounce(func, wait) {
		let timeout
		return function (...args) {
			const context = this
			clearTimeout(timeout)
			timeout = setTimeout(() => func.apply(context, args), wait)
		}
	}

	/**
	 * Parses a comma-separated attribute string into an array of trimmed, non-empty strings.
	 * @param {string|null} attr - The attribute value to parse.
	 * @returns {string[]} An array of parsed strings.
	 */
	function parseAttributeList(attr) {
		return attr
			? attr
					.split(',')
					.map((item) => item.trim())
					.filter(Boolean)
			: []
	}

	/**
	 * Fetches a resource with a specified timeout.
	 * @param {string} url - The URL to fetch.
	 * @param {object} [options] - Fetch options, including a `timeout` property.
	 * @returns {Promise<Response>} A promise that resolves with the fetch response or rejects on timeout.
	 */
	function fetchWithTimeout(url, options = {}) {
		const { timeout = 8000 } = options
		return Promise.race([
			fetch(url, options),
			new Promise((_, reject) => setTimeout(() => reject(new Error(`Request timed out: ${url}`)), timeout)),
		])
	}

	// --- Core Logic ---

	/**
	 * Initializes one or more Bynder SpinViewer instances.
	 * Scans for containers with `data-spin-container` or targets a specific `containerId`.
	 * @param {object} [options] - Configuration options.
	 * @param {string} [options.containerId] - ID of a specific container to initialize.
	 */
	BynderSpinViewer.init = function (options) {
		// Inject styles only once when init is called
		injectStyles()

		const containers = options?.containerId
			? [document.getElementById(options.containerId)]
			: document.querySelectorAll(`[${DATA_ATTR_CONTAINER}]`)

		containers.forEach((container) => {
			if (!container) {
				console.warn('BynderSpinViewer: Specified container not found.', options?.containerId)
				return
			}
			if (container.hasAttribute(DATA_ATTR_ID)) {
				console.warn('BynderSpinViewer: Container already initialized.', container)
				return // Prevent double initialization
			}

			const instanceId = `spin-${Math.random().toString(36).substring(2, 11)}`
			container.setAttribute(DATA_ATTR_ID, instanceId)

			const instance = createInstance(container, instanceId)
			instances.push(instance)
			loadSpinImages(instance)
		})
	}

	/**
	 * Creates and configures a new viewer instance.
	 * Reads configuration from data attributes on the container.
	 * @param {HTMLElement} container - The DOM element that hosts the viewer.
	 * @param {string} id - A unique identifier for this instance.
	 * @returns {object} The newly created viewer instance object.
	 */
	function createInstance(container, id) {
		container.classList.add(CLASS_VIEWER)

		const config = {
			fullscreenEnabled: container.getAttribute(DATA_ATTR_FULLSCREEN) !== 'false',
			spinSpeed: parseInt(container.getAttribute(DATA_ATTR_SPEED) || DEFAULT_SPIN_SPEED, 10),
			autoplay: container.getAttribute(DATA_ATTR_AUTOPLAY) === 'true',
			preloadAll: container.getAttribute(DATA_ATTR_PRELOAD) !== 'false',
			mediaIds: parseAttributeList(container.getAttribute(DATA_ATTR_MEDIA_IDS)),
			accountUrl: container.getAttribute(DATA_ATTR_ACCOUNT_URL),
			imageUrls: parseAttributeList(container.getAttribute(DATA_ATTR_IMAGE_URLS)),
			width: container.getAttribute(DATA_ATTR_WIDTH) || null,
			height: container.getAttribute(DATA_ATTR_HEIGHT) || null,
			scrollSpinEnabled: container.getAttribute(DATA_ATTR_SCROLL_SPIN) === 'true',
			framesPerScroll: parseInt(
				container.getAttribute(DATA_ATTR_FRAMES_PER_SCROLL) || DEFAULT_FRAMES_PER_SCROLL,
				10
			),
			customBackgroundColor: container.getAttribute(DATA_ATTR_BACKGROUND_COLOR) || DEFAULT_BACKGROUND_COLOR,
		}

		const instance = {
			id,
			container,
			images: [],
			preloadedImages: [], // Store Image objects for smoother display [OPTIMIZATION]
			preloadedCount: 0,
			currentFrame: 0,
			isDragging: false,
			lastX: 0,
			animationFrameId: null, // For requestAnimationFrame [OPTIMIZATION]
			imageElement: null,
			loadingElement: null,
			errorElement: null, // New error element
			fullscreenButton: null,
			isFullscreen: false,
			_autoplayTimer: null,
			_autoplayWasRunning: false,
			_autoplayResumeTimer: null,
			_originalBackgroundColor: config.customBackgroundColor,
			config,
			_eventHandlers: {}, // To store event listeners for cleanup [OPTIMIZATION]
		}

		setupDOM(instance)
		setupEvents(instance)
		return instance
	}

	/**
	 * Sets up the necessary DOM elements for the viewer.
	 * @param {object} instance - The viewer instance.
	 */
	function setupDOM(instance) {
		const { container, config } = instance

		container.style.backgroundColor = instance._originalBackgroundColor
		// Minimal inline styles that are dynamic or crucial for functionality
		Object.assign(container.style, {
			// position: container.style.position || 'relative', // Handled by CSS class
			// overflow: 'hidden', // Handled by CSS class
			// userSelect: 'none', // Handled by CSS class
			// touchAction: 'none', // Handled by CSS class
			// cursor: 'grab', // Handled by CSS class
		})

		// Apply custom width/height if specified (these are dynamic)
		if (config.width) container.style.width = config.width
		if (config.height) container.style.height = config.height

		// Create the image element.
		const imgEl = document.createElement('img')
		imgEl.classList.add(CLASS_IMAGE)
		Object.assign(imgEl.style, {
			// opacity: '0', // Handled by CSS class
			// transition: 'opacity 0.3s ease-in-out', // Handled by CSS class
		})
		imgEl.draggable = false
		imgEl.setAttribute('unselectable', 'on') // IE-specific
		imgEl.setAttribute('alt', '360 degree product view') // A11y

		// Create the loading indicator.
		const loadingEl = document.createElement('div')
		loadingEl.classList.add(CLASS_LOADING)
		// Inline styles for loading/error that might be dynamic or override CSS defaults
		Object.assign(loadingEl.style, {
			// display: 'flex', // Handled by CSS class
			// zIndex: '1000', // Handled by CSS class
		})
		loadingEl.textContent = 'Loading...'

		// Create the error message element.
		const errorEl = document.createElement('div')
		errorEl.classList.add(CLASS_ERROR)
		Object.assign(errorEl.style, {
			// display: 'none', // Handled by CSS class
		})
		errorEl.innerHTML = 'Failed to load 360° images. Please try again later.'

		instance.loadingElement = loadingEl
		instance.errorElement = errorEl

		// Create the fullscreen button if enabled and API is available.
		if (config.fullscreenEnabled && fullscreenAPI.enabled) {
			const fullscreenBtn = document.createElement('button')
			fullscreenBtn.type = 'button'
			fullscreenBtn.classList.add(CLASS_FULLSCREEN_BTN)
			fullscreenBtn.setAttribute('aria-label', 'Toggle fullscreen')
			// Minimal inline styles for button for hover effect / dynamic changes
			Object.assign(fullscreenBtn.style, {
				// background: 'rgba(0, 0, 0, 0.4)', // Base background handled by CSS class
			})

			const enterFullscreenIcon =
				'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>'
			fullscreenBtn.innerHTML = enterFullscreenIcon

			fullscreenBtn.addEventListener(
				'mouseover',
				() => (fullscreenBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.6)')
			)
			fullscreenBtn.addEventListener(
				'mouseout',
				() => (fullscreenBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.4)')
			)
			fullscreenBtn.addEventListener('click', (e) => {
				e.preventDefault()
				e.stopPropagation()
				toggleFullscreen(instance)
			})

			container.appendChild(fullscreenBtn)
			instance.fullscreenButton = fullscreenBtn
		}

		container.appendChild(imgEl)
		container.appendChild(loadingEl)
		container.appendChild(errorEl)
		instance.imageElement = imgEl
	}

	/**
	 * Sets up all event listeners for user interaction.
	 * @param {object} instance - The viewer instance.
	 */
	function setupEvents(instance) {
		const { container, config, _eventHandlers } = instance

		// Store handlers to allow easy removal during destroy
		_eventHandlers.startDrag = (e) => {
			const clientX = e.touches ? e.touches[0].clientX : e.clientX
			startDrag(instance, clientX)
			e.preventDefault()
		}
		_eventHandlers.onDrag = (e) => {
			const clientX = e.touches ? e.touches[0].clientX : e.clientX
			onDrag(instance, clientX)
			e.preventDefault()
		}
		_eventHandlers.stopDrag = () => stopDrag(instance)
		_eventHandlers.handleWheel = (e) => {
			e.preventDefault()
			handleSpinScroll(instance, e)
		}
		_eventHandlers.handleDblClick = (e) => {
			if (e.target.closest(`.${CLASS_FULLSCREEN_BTN}`)) return
			toggleFullscreen(instance)
		}
		_eventHandlers.handleFullscreenChange = () => {
			const actualFullscreenElement = fullscreenAPI.element()
			const isContainerCurrentlyFullscreen = actualFullscreenElement === instance.container

			if (instance.isFullscreen && !isContainerCurrentlyFullscreen) {
				_exitFullscreenAndRestore(instance)
			}
		}
		_eventHandlers.handleKeyDown = (e) => {
			if (e.key === 'Escape' && fullscreenAPI.element() === instance.container) {
				_exitFullscreenAndRestore(instance)
			}
		}
		_eventHandlers.handleResize = debounce(() => {
			if (instance.isFullscreen) {
				// No need to reset max-width/height here as object-fit handles it.
				// But debounce is still useful for general fullscreen layout adjustments.
			}
		}, 100)

		// Attach mouse events.
		container.addEventListener('mousedown', _eventHandlers.startDrag)
		document.addEventListener('mousemove', _eventHandlers.onDrag)
		document.addEventListener('mouseup', _eventHandlers.stopDrag)

		// Attach touch events.
		container.addEventListener('touchstart', _eventHandlers.startDrag, { passive: false })
		document.addEventListener('touchmove', _eventHandlers.onDrag, { passive: false })
		document.addEventListener('touchend', _eventHandlers.stopDrag)

		// Fullscreen related events.
		if (config.fullscreenEnabled && fullscreenAPI.enabled) {
			container.addEventListener('dblclick', _eventHandlers.handleDblClick)
			const fsEventName = fullscreenAPI.eventName()
			if (fsEventName) {
				document.addEventListener(fsEventName, _eventHandlers.handleFullscreenChange)
			}
			document.addEventListener('keydown', _eventHandlers.handleKeyDown)
			window.addEventListener('resize', _eventHandlers.handleResize)
		}

		// Scroll wheel for spinning.
		if (config.scrollSpinEnabled) {
			container.addEventListener('wheel', _eventHandlers.handleWheel, { passive: false })
		}
	}

	/**
	 * Removes all event listeners. Called during destroy.
	 * @param {object} instance - The viewer instance.
	 */
	function removeEvents(instance) {
		const { container, config, _eventHandlers } = instance

		container.removeEventListener('mousedown', _eventHandlers.startDrag)
		document.removeEventListener('mousemove', _eventHandlers.onDrag)
		document.removeEventListener('mouseup', _eventHandlers.stopDrag)

		container.removeEventListener('touchstart', _eventHandlers.startDrag, { passive: false })
		document.removeEventListener('touchmove', _eventHandlers.onDrag, { passive: false })
		document.removeEventListener('touchend', _eventHandlers.stopDrag)

		if (config.fullscreenEnabled && fullscreenAPI.enabled) {
			container.removeEventListener('dblclick', _eventHandlers.handleDblClick)
			const fsEventName = fullscreenAPI.eventName()
			if (fsEventName) {
				document.removeEventListener(fsEventName, _eventHandlers.handleFullscreenChange)
			}
			document.removeEventListener('keydown', _eventHandlers.handleKeyDown)
			window.removeEventListener('resize', _eventHandlers.handleResize)
		}

		if (config.scrollSpinEnabled) {
			container.removeEventListener('wheel', _eventHandlers.handleWheel, { passive: false })
		}
	}

	/**
	 * Loads spin images, either from provided URLs or by fetching from Bynder.
	 * @param {object} instance - The viewer instance.
	 */
	async function loadSpinImages(instance) {
		const { config, container } = instance
		try {
			if (config.imageUrls.length > 0) {
				instance.images = config.imageUrls
			} else if (config.mediaIds.length > 0 && config.accountUrl) {
				await fetchImagesFromBynder(instance)
			} else {
				showError(instance, 'No image sources provided (imageUrls or mediaIds/accountUrl).')
				console.error(
					'BynderSpinViewer: No image sources provided (imageUrls or mediaIds/accountUrl).',
					container
				)
				return
			}

			if (instance.images.length === 0) {
				showError(instance, 'No valid images to display.')
				console.warn('BynderSpinViewer: No valid images to display.', container)
				return
			}

			await preloadImages(instance)
		} catch (error) {
			showError(instance, 'Failed to load 360° images due to a network error or invalid data.')
			console.error('BynderSpinViewer: Failed to load images.', error)
		} finally {
			hideLoading(instance) // Ensure loading is hidden even on error
		}
	}

	/**
	 * Fetches image URLs from Bynder's media feed API using provided media IDs.
	 * @param {object} instance - The viewer instance.
	 */
	async function fetchImagesFromBynder(instance) {
		const { accountUrl, mediaIds } = instance.config
		const baseAccountUrl = accountUrl.replace(/\/$/, '')
		const promises = mediaIds.map(async (id) => {
			try {
				const response = await fetchWithTimeout(`${baseAccountUrl}/feeds/media/${id}/`, { timeout: 10000 })
				if (!response.ok) {
					throw new Error(`HTTP error! Status: ${response.status} for media ID: ${id}`)
				}
				const data = await response.json()
				return data.image
			} catch (error) {
				console.error(`BynderSpinViewer: Error fetching media ID ${id}:`, error)
				return null
			}
		})

		const urls = await Promise.all(promises)
		instance.images = urls.filter(Boolean)
	}

	/**
	 * Preloads images to ensure a smooth spinning experience.
	 * Uses Image objects for faster swapping. Incorporates image decoding for smoother rendering.
	 * @param {object} instance - The viewer instance.
	 * @returns {Promise<void>} Resolves when all images are preloaded or first image is ready.
	 */
	function preloadImages(instance) {
		const { images, preloadedImages, imageElement, config } = instance
		return new Promise((resolve) => {
			if (images.length === 0) {
				showError(instance, 'No images to preload.')
				resolve()
				return
			}

			let loadedCount = 0
			const totalImages = images.length
			let firstImageDisplayed = false

			const checkCompletion = () => {
				loadedCount++
				instance.preloadedCount = loadedCount // Update instance property
				updateLoadingProgress(instance)

				if (!firstImageDisplayed && instance.preloadedImages[0]) {
					// Ensure the first image is displayed as soon as it's loaded and decoded.
					if (instance.preloadedImages[0].complete || (config.preloadAll === false && loadedCount === 1)) {
						imageElement.src = instance.preloadedImages[0].src
						imageElement.style.opacity = '1'
						hideLoading(instance)
						if (config.autoplay && instance.images.length > 1) startAutoplay(instance)
						firstImageDisplayed = true
						// If not preloading all, resolve immediately after first image
						if (!config.preloadAll) {
							resolve()
						}
					}
				}

				if (loadedCount === totalImages) {
					completePreloading(instance)
					resolve()
				}
			}

			images.forEach((url, index) => {
				const img = new Image()
				img.src = url
				// Use img.decode() for smoother display if supported
				if (img.decode) {
					img.decode()
						.then(() => {
							instance.preloadedImages[index] = img // Store decoded image
							checkCompletion()
						})
						.catch((err) => {
							console.warn('BynderSpinViewer: Failed to decode image:', url, err)
							// Proceed even if decode fails, image might still be displayable
							instance.preloadedImages[index] = img // Store it anyway
							checkCompletion()
						})
				} else {
					// Fallback for browsers without decode
					img.onload = () => {
						instance.preloadedImages[index] = img
						checkCompletion()
					}
					img.onerror = () => {
						console.warn('BynderSpinViewer: Failed to load image:', url)
						instance.preloadedImages[index] = new Image() // Store a blank image or handle as desired
						checkCompletion() // Still count it to complete preloading
					}
				}
			})

			// Edge case: if no images, resolve immediately
			if (totalImages === 0) {
				showError(instance, 'No images to load.')
				resolve()
			}
		})
	}

	/**
	 * Updates the loading progress text.
	 * @param {object} instance - The viewer instance.
	 */
	function updateLoadingProgress(instance) {
		const progress = Math.round((instance.preloadedCount / instance.images.length) * 100)
		if (instance.loadingElement) {
			instance.loadingElement.textContent = `Loading... ${isNaN(progress) ? 0 : progress}%`
		}
	}

	/**
	 * Completes the preloading process, hiding the loading indicator and showing the first image.
	 * @param {object} instance - The viewer instance.
	 */
	function completePreloading(instance) {
		hideLoading(instance)
		// Only set image src if not already set by firstImageDisplayed logic
		if (instance.images.length > 0 && instance.imageElement.style.opacity === '0') {
			instance.imageElement.src = instance.preloadedImages[instance.currentFrame].src
			instance.imageElement.style.opacity = '1' // Make image visible
		} else if (instance.images.length === 0) {
			showError(instance, 'No images available to display after loading.')
		}

		if (instance.config.autoplay && instance.images.length > 1) {
			// Only autoplay if multiple images
			startAutoplay(instance)
		}
		instance.container.dispatchEvent(new CustomEvent('spinviewer:loaded', { detail: { instanceId: instance.id } }))
	}

	/**
	 * Hides the loading indicator.
	 * @param {object} instance - The viewer instance.
	 */
	function hideLoading(instance) {
		if (instance.loadingElement) {
			instance.loadingElement.style.opacity = '0'
			// Remove after transition to allow pointer events on image
			setTimeout(() => {
				if (instance.loadingElement) instance.loadingElement.style.display = 'none'
			}, 300) // Match transition duration
		}
	}

	/**
	 * Shows an error message and hides loading.
	 * @param {object} instance - The viewer instance.
	 * @param {string} message - The error message to display.
	 */
	function showError(instance, message) {
		hideLoading(instance)
		if (instance.errorElement) {
			instance.errorElement.textContent = message
			instance.errorElement.style.display = 'flex'
			instance.imageElement.style.opacity = '0' // Hide image if any was partially loaded
		}
	}

	/**
	 * Starts the autoplay animation.
	 * @param {object} instance - The viewer instance.
	 */
	function startAutoplay(instance) {
		stopAutoplay(instance) // Clear any existing timer
		if (!instance.isDragging && instance.images.length > 1) {
			instance._autoplayTimer = setInterval(() => {
				requestAnimationFrame(() => showNextFrame(instance)) // Use rAF for smoother animation
			}, instance.config.spinSpeed)
			instance._autoplayWasRunning = true
		}
	}

	/**
	 * Stops the autoplay timer.
	 * @param {object} instance - The viewer instance.
	 */
	function stopAutoplay(instance) {
		if (instance._autoplayTimer) {
			clearInterval(instance._autoplayTimer)
			instance._autoplayTimer = null
		}
	}

	/**
	 * Initiates a drag operation.
	 * @param {object} instance - The viewer instance.
	 * @param {number} clientX - The initial X coordinate.
	 */
	function startDrag(instance, clientX) {
		if (instance.images.length <= 1) return
		instance.isDragging = true
		instance.lastX = clientX
		instance.container.classList.add(CLASS_GRABBING_CURSOR)

		instance._autoplayWasRunning = instance._autoplayTimer !== null
		stopAutoplay(instance)
		cancelAnimationFrame(instance.animationFrameId) // Stop any pending animation frame
	}

	/**
	 * Handles drag movement.
	 * @param {object} instance - The viewer instance.
	 * @param {number} clientX - The current X coordinate.
	 */
	function onDrag(instance, clientX) {
		if (!instance.isDragging || instance.images.length <= 1) return

		const deltaX = clientX - instance.lastX
		if (Math.abs(deltaX) >= DRAG_SENSITIVITY) {
			// Schedule frame update with requestAnimationFrame
			if (!instance.animationFrameId) {
				instance.animationFrameId = requestAnimationFrame(() => {
					if (deltaX > 0) {
						showPrevFrame(instance) // Dragging right shows previous
					} else {
						showNextFrame(instance) // Dragging left shows next
					}
					instance.lastX = clientX // Update lastX after frame change
					instance.animationFrameId = null
				})
			}
		}
	}

	/**
	 * Ends the drag operation.
	 * @param {object} instance - The viewer instance.
	 */
	function stopDrag(instance) {
		instance.isDragging = false
		instance.container.classList.remove(CLASS_GRABBING_CURSOR)
		cancelAnimationFrame(instance.animationFrameId)
		instance.animationFrameId = null

		if (instance.config.autoplay && instance._autoplayWasRunning) {
			startAutoplay(instance)
		}
	}

	/**
	 * Displays the next frame.
	 * @param {object} instance - The viewer instance.
	 */
	function showNextFrame(instance) {
		if (!instance.images.length) return

		instance.currentFrame = (instance.currentFrame + 1) % instance.images.length
		if (instance.preloadedImages[instance.currentFrame]) {
			instance.imageElement.src = instance.preloadedImages[instance.currentFrame].src
		}
		instance.container.dispatchEvent(
			new CustomEvent('spinviewer:framechange', {
				detail: { instanceId: instance.id, frame: instance.currentFrame },
			})
		)
	}

	/**
	 * Displays the previous frame.
	 * @param {object} instance - The viewer instance.
	 */
	function showPrevFrame(instance) {
		if (!instance.images.length) return

		instance.currentFrame = (instance.currentFrame - 1 + instance.images.length) % instance.images.length
		if (instance.preloadedImages[instance.currentFrame]) {
			instance.imageElement.src = instance.preloadedImages[instance.currentFrame].src
		}
		instance.container.dispatchEvent(
			new CustomEvent('spinviewer:framechange', {
				detail: { instanceId: instance.id, frame: instance.currentFrame },
			})
		)
	}

	/**
	 * Handles spin interaction via mouse wheel.
	 * @param {object} instance - The viewer instance.
	 * @param {WheelEvent} e - The wheel event object.
	 */
	function handleSpinScroll(instance, e) {
		if (instance.isDragging || instance.images.length <= 1) return

		const frames = instance.config.framesPerScroll
		// Use requestAnimationFrame for scroll-triggered frame changes as well
		if (!instance.animationFrameId) {
			instance.animationFrameId = requestAnimationFrame(() => {
				if (e.deltaY < 0) {
					// Scroll up/forward
					for (let i = 0; i < frames; i++) showNextFrame(instance)
				} else if (e.deltaY > 0) {
					// Scroll down/backward
					for (let i = 0; i < frames; i++) showPrevFrame(instance)
				}
				instance.animationFrameId = null
			})
		}

		if (instance.config.autoplay) {
			instance._autoplayWasRunning = instance._autoplayTimer !== null
			stopAutoplay(instance)
			clearTimeout(instance._autoplayResumeTimer)
			instance._autoplayResumeTimer = setTimeout(() => {
				if (!instance.isDragging && instance._autoplayWasRunning) {
					startAutoplay(instance)
				}
			}, AUTOPLAY_RESUME_DELAY)
		}
	}

	/**
	 * Toggles the fullscreen mode.
	 * @param {object} instance - The viewer instance.
	 */
	function toggleFullscreen(instance) {
		const { container, fullscreenButton, imageElement, _originalBackgroundColor } = instance
		const actualFullscreenElement = fullscreenAPI.element()
		const isContainerCurrentlyFullscreen = actualFullscreenElement === container

		if (!isContainerCurrentlyFullscreen) {
			instance._autoplayWasRunning = instance._autoplayTimer !== null
			stopAutoplay(instance)

			container.style.setProperty('--spinviewer-bg', _originalBackgroundColor)

			fullscreenAPI
				.request(container)
				.then(() => {
					instance.isFullscreen = true
					container.classList.add(CLASS_FULLSCREEN_ACTIVE)
					// Inline styles for fullscreen that might override CSS defaults or are crucial
					Object.assign(container.style, {
						backgroundColor: _originalBackgroundColor, // Restore original color
						// display: 'flex', // Handled by CSS class
						// justifyContent: 'center', // Handled by CSS class
						// alignItems: 'center', // Handled by CSS class
						// overflow: 'hidden', // Handled by CSS class
					})
					Object.assign(imageElement.style, {
						// objectFit: 'contain', // Handled by CSS class
						// maxWidth: '100%', // Handled by CSS class
						// maxHeight: '100%', // Handled by CSS class
					})
					document.body.style.overflow = 'hidden'

					if (fullscreenButton) {
						fullscreenButton.innerHTML =
							'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6m0 0v6m0-6-7 7m17-11h-6m0 0V4m0 6 7-7"></path></svg>'
					}
					container.dispatchEvent(
						new CustomEvent('spinviewer:fullscreenchange', {
							detail: { instanceId: instance.id, isFullscreen: true },
						})
					)
				})
				.catch((err) => {
					console.error('BynderSpinViewer: Error attempting to enter fullscreen:', err)
					if (instance.config.autoplay && instance._autoplayWasRunning) {
						startAutoplay(instance)
					}
				})
		} else {
			if (actualFullscreenElement) {
				fullscreenAPI.exit().catch((err) => {
					console.error('BynderSpinViewer: Error attempting to exit fullscreen:', err)
				})
			}
			// State and styles are reverted by _exitFullscreenAndRestore via fullscreenchange event
		}
	}

	/**
	 * Resets styles and resumes autoplay when exiting fullscreen.
	 * @param {object} instance - The viewer instance.
	 */
	function _exitFullscreenAndRestore(instance) {
		instance.isFullscreen = false
		const { container, imageElement, fullscreenButton, _originalBackgroundColor } = instance

		container.classList.remove(CLASS_FULLSCREEN_ACTIVE)
		Object.assign(container.style, {
			backgroundColor: _originalBackgroundColor, // Restore original color
			display: '', // Revert to default
			justifyContent: '',
			alignItems: '',
			overflow: 'hidden', // Keep hidden for the spin viewer
		})

		Object.assign(imageElement.style, {
			maxWidth: '100%',
			maxHeight: '100%',
			objectFit: '', // Revert
		})

		document.body.style.overflow = ''

		if (fullscreenButton) {
			fullscreenButton.innerHTML =
				'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>'
		}

		if (instance.config.autoplay && instance._autoplayWasRunning && instance.images.length > 1) {
			startAutoplay(instance)
		}
		instance.container.dispatchEvent(
			new CustomEvent('spinviewer:fullscreenchange', { detail: { instanceId: instance.id, isFullscreen: false } })
		)
	}

	// --- Public API ---

	/**
	 * Retrieves a SpinViewer instance by its container ID.
	 * @param {string} containerId - The ID of the container element.
	 * @returns {object|null} The viewer instance object or null if not found.
	 */
	BynderSpinViewer.getInstance = function (containerId) {
		return instances.find((inst) => inst.container.id === containerId) || null
	}

	/**
	 * Destroys a SpinViewer instance, removing its DOM elements and event listeners.
	 * @param {string} containerId - The ID of the container element.
	 * @returns {boolean} True if the instance was found and destroyed, false otherwise.
	 */
	BynderSpinViewer.destroy = function (containerId) {
		const index = instances.findIndex((inst) => inst.container.id === containerId)
		if (index === -1) return false

		const instance = instances[index]
		stopAutoplay(instance)
		removeEvents(instance)

		// Remove DOM elements
		if (instance.imageElement) instance.imageElement.remove()
		if (instance.loadingElement) instance.loadingElement.remove()
		if (instance.errorElement) instance.errorElement.remove()
		if (instance.fullscreenButton) instance.fullscreenButton.remove()

		// Restore original container styles/attributes if necessary (optional, but good practice)
		instance.container.style.cssText = '' // Resets inline styles
		instance.container.removeAttribute(DATA_ATTR_ID)
		instance.container.classList.remove(CLASS_VIEWER, CLASS_FULLSCREEN_ACTIVE, CLASS_GRABBING_CURSOR)

		instances.splice(index, 1) // Remove from instances array
		console.log(`BynderSpinViewer: Instance ${containerId} destroyed.`)
		return true
	}

	/**
	 * Automatically initializes any SpinViewer instances found in the DOM
	 * when the document is ready.
	 */
	function autoInit() {
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', () => BynderSpinViewer.init())
		} else {
			BynderSpinViewer.init()
		}
	}

	autoInit()

	return BynderSpinViewer
})
