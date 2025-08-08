// models/plugins.js
const toJSONPlugin = (schema) => {
  schema.set('toJSON', {
    transform(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  });
};

const paginatePlugin = (schema) => {
  schema.statics.paginate = async function (filter, options) {
    // Basic pagination implementation
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;
    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const skip = (page - 1) * limit;

    const countPromise = this.countDocuments(filter).exec();
    const docsPromise = this.find(filter).skip(skip).limit(limit).exec();

    return Promise.all([countPromise, docsPromise]).then((values) => {
      const [total, results] = values;
      const totalPages = Math.ceil(total / limit);
      return {
        results,
        page,
        limit,
        totalPages,
        total
      };
    });
  };
};

module.exports = {
  toJSON: toJSONPlugin,
  paginate: paginatePlugin
};