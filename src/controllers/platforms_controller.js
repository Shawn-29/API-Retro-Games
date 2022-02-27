const { OK, NOT_FOUND } = require('http-status-codes').StatusCodes;
const { SYM_DB_CONNECTION } = require('../symbols');

/* get general info for all platforms */
const getPlatforms = async (_, res) => {
    const query = `
        SELECT id, name, release_year, img_url
        FROM platforms
    `;
    res.locals[SYM_DB_CONNECTION].query(query, (err, result) => {
        if (err) {
            return res.status(NOT_FOUND)
                .json({
                    platforms: null,
                    error: 'Could not get platform data.'
                });
        }
        res.status(OK)
            .json({
                platforms: result
            });
    });
};

module.exports = getPlatforms;