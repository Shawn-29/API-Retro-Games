const mySQL = require('mysql');
const { OK, NOT_FOUND } = require('http-status-codes').StatusCodes;
const { SYM_DB_CONNECTION } = require('../symbols');

/* default route; gets a single game by title and platform */
const getSingleGame = async (req, res) => {

    const [title, platform] = req.query?.title?.split('_', 2) ?? '';

    const query = mySQL.format(`
        SELECT gm.title, gm.release_year, p.name platform,
            pl.name publisher, d.name developer, gr.type genre,
            gm.description,
            GROUP_CONCAT(DISTINCT i.url SEPARATOR ',') img_urls
        FROM games gm
        LEFT JOIN platforms p
            ON gm.platform_id = p.id
        LEFT JOIN publishers pl
            ON gm.publisher_id = pl.id
        LEFT JOIN developers d
            ON gm.developer_id = d.id
        LEFT JOIN genres gr
            ON gm.genre_id = gr.id
        LEFT JOIN game_images i
            ON gm.id = i.game_id
        WHERE gm.title = ? AND
            p.name = ?
        GROUP BY gm.title, gm.release_year, platform,
            publisher, developer, genre,
            gm.description
        LIMIT 1;
    `,
        [
            title, platform
        ]
    );
    res.locals[SYM_DB_CONNECTION].query(query, (err, result) => {
        if (err || !result[0]) {
            return res.status(NOT_FOUND)
                .json({
                    gameData: null,
                    error: 'Could not get specific game data.'
                });
        }
        res.status(OK)
            .json({
                gameData: result[0]
            });
    });
};

module.exports = getSingleGame;