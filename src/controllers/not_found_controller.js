const { NOT_FOUND } = require('http-status-codes').StatusCodes;
const { SYM_QUERY_STATUS, SYM_QUERY_RESULT } = require('../symbols');

const notFound = (_, res, next) => {
    res.status(NOT_FOUND)
    .json({
        error: 'Invalid URL.'
    });
};

module.exports = notFound;