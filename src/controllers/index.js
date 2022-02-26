const featuredGames = require('./featured_games_controller'),
    games = require('./games_controller'),
    platform = require('./platform_controller'),
    platforms = require('./platforms_controller'),
    singleGame = require('./single_game_controller'),
    notFound = require('./not_found_controller');

module.exports = {
    featuredGames,
    games,
    platform,
    platforms,
    singleGame,
    notFound
};