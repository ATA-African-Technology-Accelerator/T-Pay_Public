// Lets the app see a double press of Volume Up. Android only delivers key presses to the
// activity, so this adds a small override to the generated MainActivity. The `android/` folder is
// rebuilt by Expo, which is why this is a plugin and not an edited file.
const { withMainActivity } = require('expo/config-plugins');

const MARKER = 'tpay-volume-keys';
const OVERRIDE = `  // ${MARKER}
  override fun onKeyDown(keyCode: Int, event: android.view.KeyEvent?): Boolean {
    if (expo.modules.tpayvolume.VolumeKeys.handle(keyCode, event?.repeatCount ?: 0)) return true
    return super.onKeyDown(keyCode, event)
  }

`;

module.exports = function withVolumeKeys(config) {
  return withMainActivity(config, (mod) => {
    const source = mod.modResults.contents;
    if (mod.modResults.language !== 'kt' || source.includes(MARKER)) return mod;
    const anchor = '  override fun getMainComponentName()';
    const at = source.indexOf(anchor);
    if (at === -1) throw new Error('withVolumeKeys: could not find getMainComponentName in MainActivity');
    // Keep the KDoc comment above getMainComponentName attached to it.
    const comment = source.lastIndexOf('  /**', at);
    const insertAt = comment !== -1 && source.slice(comment, at).trim().endsWith('*/') ? comment : at;
    mod.modResults.contents = source.slice(0, insertAt) + OVERRIDE + source.slice(insertAt);
    return mod;
  });
};
