class MessageData {
  toJSON() {
    throw new Error("Don't use base class");
  }

  static FromJSON(json) {
    throw new Error("Don't use base class");
  }
}

class PrintData extends MessageData {

  static get KEY() {
    return Object.freeze({
      DATA: "d",
      OPTIONS: "o",
    })
  }

  constructor(data, options) {
    super();
    this.data = data;
    this.options = options;
  }

  toJSON() {
    const json = {};
    json[PrintData.KEY.DATA] = this.data;
    json[PrintData.KEY.OPTIONS] = this.options;

    return json;
  }

  static FromJSON(json) {
    return new PrintData(json[PrintData.KEY.DATA], json[PrintData.KEY.OPTIONS]);
  }
}

class StatusData extends MessageData {

  /**
   *
   * @returns {Readonly<{OK: string, ERROR: string}>}
   * @enum
   */
  static get STATUS_TYPE() {
    return Object.freeze({
      OK: "0",
      ERROR: "1",
    })
  }

  static get KEY() {
    return Object.freeze({
      TYPE: "t",
      MESSAGE: "m",
    })
  }

  /**
   *
   * @param {StatusData.STATUS_TYPE} sType
   * @param {string} sMsg
   */
  constructor(sType, sMsg) {
    super();
    this.sType = sType;
    this.sMsg = sMsg;
  }

  toJSON() {
    const json = {};
    json[StatusData.KEY.TYPE] = this.sType;
    json[StatusData.KEY.MESSAGE] = this.sMsg;

    return json;
  }

  static FromJSON(json) {
    return new PrintData(json[PrintData.KEY.DATA], json[PrintData.KEY.OPTIONS]);
  }
}

class ConfigurationData extends MessageData {
  constructor(config) {
    super();
    this.config = config;
  }

  toJSON() {
    // const json = {};
    // json[StatusData.KEY.TYPE] = this.sType;
    // json[StatusData.KEY.MESSAGE] = this.sMsg;
    //
    // return json;
    return this.config || {};
  }

  static FromJSON(json) {
    return new ConfigurationData(json);
  }

}

module.exports = {PrintData, StatusData, ConfigurationData};
