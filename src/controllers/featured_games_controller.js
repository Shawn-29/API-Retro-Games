const { OK, NOT_FOUND } = require('http-status-codes').StatusCodes;
const { SYM_DB_CONNECTION } = require('../symbols');

/* get featured games */
const getFeaturedGames = async (_, res) => {
    res.locals[SYM_DB_CONNECTION].query(`
        SELECT gm.title, gm.release_year, p.name platform,
            pl.name publisher, d.name developer, gr.type genre,
            gm.description,
            GROUP_CONCAT(DISTINCT i.url SEPARATOR ',') AS img_urls
        FROM games gm
        RIGHT JOIN featured_games f
            ON gm.id = f.id
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
        GROUP BY gm.title, gm.release_year, platform,
            publisher, developer, genre,
            gm.description
        `,
        (err, result) => {
            if (err) {
                return res.status(NOT_FOUND)
                    .json({
                        featured_games: null,
                        error: 'Could not get featured games.'
                    });
            }
            res.status(OK)
                .json({
                    featured_games: result
                });
        }
    )
};

module.exports = getFeaturedGames;