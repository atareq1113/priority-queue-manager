class BackgroundAPI {
  constructor(jancy) {
    this.jancy = jancy
    this.listeners = []

    // Listen for preference updates
    jancy.ipc.on('queue-it-update', this.onUpdateIPC)
  }

  destroy() {
    this.jancy.ipc.off('queue-it-update', this.onUpdateIPC)
  }

  onUpdateIPC(event, arg) {
    // Handle any background processing if needed
  }
}

let myPreloaderId = null
let mySettingPanelId = null

function getSettingsPanel({ getBasePanelClass, webContentId, preferences }) {

  const { widgets, lighterhtml } = window.jancy

  function onChanged(comp, event, pref) {
    const updatedPrefs = {}
    updatedPrefs[pref] = event.target.value
    window.jancyAPI.dispatchAction("preferences:update", updatedPrefs)
  }

  /**
   * Our setting panel that implements the required methods that the setting panel
   * page requires.
   */
  class QueueItSettingPanel extends getBasePanelClass() {
    /**
     * Constructor.
     * 
     * @param {number} webContentId 
     * @param {object} preferences 
     */
    constructor(webContentId, preferences) {
      super()
      this.webContentId = webContentId

      window.jancyAPI.addStyle(`
        .priority-line > label {
          padding-right: 1em;
        }
      `)

      this.parent = new widgets.Widget()

      // Create dropdowns for the three states
      const dropdownConfigs = [
        { name: 'waiting_room_priority', label: 'Tabs in waiting room' },
        { name: 'queue_priority', label: 'Tabs in queue' },
        { name: 'event_priority', label: 'Tabs on an event page' },
        { name: 'checkout_priority', label: 'Tabs on a checkout page' }
      ]

      dropdownConfigs.forEach(config => {
        new widgets.Select({
          parent: this.parent,
          name: config.name,
          label: config.label,
          value: preferences[config.name] || '0',
          options: Array.from({length: 10}, (_, i) => ({ 
            value: String(i), 
            label: String(i) 
          })),
          callback: (comp, event) => onChanged(comp, event, config.name)
        })
      })

      this.parent.node = lighterhtml.html.node`
        <div class="block setting-panel">
          <div class="block setting-section">
            <h2>Priority Groups</h2>

            <span>
              Use the following values to assign a unique priority group to tabs as they reach certain stages in the order flow
            </span>

            <div class="block" style="margin-top: 15px;">
              <div class="priority-line">
                ${this.parent.getChildNode('waiting_room_priority')}
              </div>
              <div class="priority-line">
                ${this.parent.getChildNode('queue_priority')}
              </div>
              <div class="priority-line">
                ${this.parent.getChildNode('event_priority')}
              </div>
              <div class="priority-line">
                ${this.parent.getChildNode('checkout_priority')}
              </div>
            </div>
          </div>
        </div>
      `
    }

    
    /**
     * Must return an HTML element that serves as the content of the panel.
     * 
     * @returns {HTMLElement}
     */
    getElement() {
      return this.parent.node
    }

    /**
     * Called when the preference registry has notified us that preferences have changed.
     * 
     * @param {object} changes 
     */
    onPreferencesUpdated(changes) {
      const preferences = [
        'queue_priority',
        'event_priority',
        'checkout_priority',
        'waiting_room_priority'
      ]

      preferences.forEach(p => {
        if (p in changes) {
          let child = this.parent.getChild(p)
          if (child && child.getValue() !== changes[p]) {        
            child.setValue(changes[p])          
          }
        }
      })
    }
  }

  return new QueueItSettingPanel(webContentId, preferences)
}

module.exports = {
  /* jancy_props is an object used to communicate some useful information about
  ** your plugin to the Jancy plugin registry.
  **
  ** Required props:
  **    registryVersion (number) - tells Jancy what version of the plugin registry
  **                               this plugin was built against. Currently version
  **                               "1" is supported.
  **
  ** Optional props:
  **    enabled (boolean) - if false, tells Jancy to not enable your plugin by
  **                        default the first time it loads. Default is true.
  */
  jancy_props: {
    registryVersion: 1
  },

  /* --------------------------------------------------------------------------
  ** jancy_onInit is called by the plugin registry when the plugin is loaded.
  **
  ** This is your first opportunity to interact with Jancy.
  **
  ** Arguments:
  **    jancy (Object)
  **    enabled (boolean) -- is our plugin enabled
  ** ------------------------------------------------------------------------*/
  jancy_onInit(jancy, enabled) {
    // Register the three new preferences
    jancy.preferenceRegistry.register('queue_priority', '0')
    jancy.preferenceRegistry.register('event_priority', '0')
    jancy.preferenceRegistry.register('checkout_priority', '0')
    jancy.preferenceRegistry.register('waiting_room_priority', '0')

    if (enabled) {
      this.jancy_onEnabled(jancy)
    }
  },

  /* --------------------------------------------------------------------------
  ** Called by the pluginRegistry when the user has enabled us and we
  ** were previously disabled.
  **
  ** This is a good opportunity to add things to Jancy that your plugin
  ** provides.
  **
  ** Arguments:
  **    jancy (object)
  ** ------------------------------------------------------------------------*/
  jancy_onEnabled(jancy) {

    const myPreloader = {
      urlPatterns: [
        '^https:\/\/seatgeek\.com'
      ],
      pluginPath: __dirname,
      entry: "getPosition",
      preloaderVersion: 1
    }

    myPreloaderId = jancy.preloaders.add(myPreloader)
    mySettingPanelId = jancy.settingPanels.add("SeatGeek", getSettingsPanel)
  },

  /* --------------------------------------------------------------------------
  ** Called by the pluginRegistry when the user has disabled us and
  ** we were previously enabled.
  **
  ** This is a good opportunity to remove things from Jancy that your plugin
  ** added.
  **
  ** Arguments:
  **    jancy (object)
  ** ------------------------------------------------------------------------*/
  jancy_onDisabled(jancy) {
    jancy.preloaders.remove(myPreloaderId)
    jancy.settingPanels.remove(mySettingPanelId)
    
  },

  /* --------------------------------------------------------------------------
  ** This is the entry point of our preloader. This function runs before the
  ** webpage loads in a tab in an isolated context.
  ** ------------------------------------------------------------------------*/
  getPosition({ jancyAPI, tab, preferences, isMainFrame }) {
    /* Don't do anything unless we're running in the main frame.
    */
    if (!isMainFrame) {
      return
    }

    document.addEventListener('DOMContentLoaded', () => {
      
      setInterval(() => {
        let priorityGroup = 0; // Default priority

        if (document.body.innerText.includes("This page is popular right now so a queue has formed") || document.body.innerText.includes("You're in line!") ) {
          priorityGroup = preferences.queue_priority;
        } else if (document.body.innerText.includes("listings") || document.body.innerText.includes("Box office & resale")) {
          priorityGroup = preferences.event_priority;
        } else if (
          document.body.innerText.includes("Tickets will be delivered to the email address provided below.") ||
          document.body.innerText.includes("SeatGeek checkout is always secure and encrypted.") ||
          document.body.innerText.includes("We sell resale tickets. Resale tickets may be above or below face value.")
        ) {
          priorityGroup = preferences.checkout_priority;
        } else if (document.body.innerText.includes("You're in the waiting room!")) {
          priorityGroup = preferences.waiting_room_priority
        }

        
        jancyAPI.dispatchAction(`tab:${tab.uuid}:update`, { priorityGroup });
      }, 1000)
    })
  }
}