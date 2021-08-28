const Page = require('./page');

/**
 * Sub page containing specific selectors and methods for a specific page
 */
class LoginPage extends Page {
  /**
   * Define selectors using getter methods
   */
  get inputUsername() {
    return $('#username');
  }

  get inputPassword() {
    return $('#password');
  }

  get btnSubmit() {
    return $('button[type="submit"]');
  }

  /**
   * A method to encapsule automation code to interact with the page
   * e.g. to login using username and password
   */
  async login(username, password) {
    await this.inputUsername.setValue(username);
    await this.inputPassword.setValue(password);
    await this.btnSubmit.click();
  }

  /**
   * Overwrite specifc options to adapt it to page object
   */
  open() {
    return super.open('login');
  }
}

module.exports = new LoginPage();
