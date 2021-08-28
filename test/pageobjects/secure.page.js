const Page = require('./page');

/**
 * Sub page containing specific selectors and methods for a specific page
 */
class SecurePage extends Page {
  /**
   * Define selectors using getter methods
   */
  get flashAlert() {
    return $('#flash');
  }
}

module.exports = new SecurePage();
