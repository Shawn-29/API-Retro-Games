const mySQL = require('mysql');
const { OK, NOT_FOUND } = require('http-status-codes').StatusCodes;
const { SYM_DB_CONNECTION } = require('../symbols');

/* get platform-specific data including genre counts */
const getPlatform = async (req, res) => {
    new Promise((resolve, reject) => {
        const pId = req.query.pId;
        if (pId.length === 0 || !Number.isSafeInteger(+pId)) {
            reject();
        }
        /* get general info for this platform */
        const platformQuery = mySQL.format(
            `SELECT name, release_year, img_url
            FROM platforms
            WHERE id = ?`,
            pId
        );
        /* get a count of each genre for this platform */
        const countQuery = mySQL.format(
            `SELECT gr.type type, COUNT(*) count
            FROM games gm
            LEFT JOIN genres gr
            ON gm.genre_id = gr.id
            LEFT JOIN platforms p
            ON gm.platform_id = p.id
            WHERE p.id = ?
            GROUP BY gr.type`,
            pId
        );
        res.locals[SYM_DB_CONNECTION].query(`${platformQuery}; ${countQuery};`, (err, result) => {
            if (err || result[0].length === 0) {
                reject();
            }
            else {
                resolve(result);
            }
        });
    })
        .then(data => {
            res.status(OK)
                .json({
                    ...data[0][0],
                    genres: data[1],
                });
        })
        .catch(() => {
            res.status(NOT_FOUND)
                .json({
                    result: [],
                    error: 'Could not get specific platform data.'
                });
        });
};

module.exports = getPlatform;