import {BCAbstractRobot, SPECS} from 'battlecode';

let step = -1;

class MyRobot extends BCAbstractRobot {
    constructor() {
        super();

        this.compass = [
            [0, -1], [1, 0], [-1, 0], [0, 1],
            [-1, 1], [-1, -1], [1, -1], [1, 1]
        ];

        this.castles = 0;
        this.pilgrims = 0;

        this.karbonite_deposits = null;
        this.fuel_deposits = null;

        this.nearest_deposit = null;
        this.nearest_karbonite = null;
        this.nearest_fuel = null;

        this.target = null;
        this.path = null;
    }

    turn() {
        step++;

        this.log('START TURN ' + step);

        if (this.me.unit == SPECS.CASTLE) {
            this.log('Castle [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            if (step == 0) {
                // TODO: track resource locations
                this.karbonite_deposits = this.get_resources(
                    this.karbonite_map);
                this.fuel_deposits = this.get_resources(this.fuel_map);
            }

            // TODO: listen for castle talk from other castles/churches for
            // accounting of pilgrims - avoid overbuilding
            var visibles = this.get_visible_robots();
            for (var i = 0; i < visibles.length; i++) {
                var robot = visibles[i];
                if (robot.unit < 2) {
                    this.log('  unit [' + robot.id + '], message: '
                        + robot.castle_talk);
                    if (robot.castle_talk == 0x01) {
                        this.pilgrims++;
                        if (step == 1) {
                            this.castles++;
                        }
                    }
                }
            }

            var target = null;

            // clear castle talk by default
            this.castle_talk(0x00);

            // TODO: decide when to build pilgrims
            if (step < 2) {
                var buildable = this.get_adjacent_passable_empty_squares();
                // TODO: find closest buildable square to target
                target = buildable[0];

                // castle talk to increment pilgrim number
                this.castle_talk(0x01);
            }

            if (target != null) {
                return this.build_unit(SPECS.PILGRIM,
                                       target[0] - this.me.x,
                                       target[1] - this.me.y);
            }
        }

        else if (this.me.unit == SPECS.CHURCH) {
            this.log('Church [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');
        }

        else if (this.me.unit == SPECS.PILGRIM) {
            this.log('Pilgrim [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');

            // save birthplace as nearest deposit time
            if (step === 0) {
                this.nearest_deposit = this.get_adjacent_deposit_point();
                this.nearest_karbonite = this.get_nearest_resource(
                    this.karbonite_map);
                this.nearest_fuel = this.get_nearest_resource(this.fuel_map);

                this.target = this.nearest_karbonite;
            }

            // TODO: check for attacking units and check distance to deposit
            // point
            // TODO: evade attackers if possible - be careful here not to be
            // overly scared

            // mine resources if safe and appropriate
            if (this.on_resource(this.karbonite_map) && this.me.karbonite < 19) {
                this.target = null;
                this.log('  - mining karbonite');
                return this.mine();
            }

            if (this.on_resource(this.fuel_map) && this.me.fuel < 91) {
                this.target = null;
                this.log('  - mining fuel');
                return this.mine();
            }

            // TODO: always check and update for adjacent deposit points
            // possible to try to build churches in the path between the
            // resource and the original 'birth' castle/church

            if (this.is_adjacent(this.nearest_deposit)
                    && (this.me.karbonite || this.me.fuel)) {
                this.log('  - depositing resources');
                return this.give(this.nearest_deposit[0] - this.me.x,
                                 this.nearest_deposit[1] - this.me.y,
                                 this.me.karbonite, this.me.fuel);
            }

            // return to 'birth' castle/church
            if (this.me.karbonite > 18 || this.me.fuel > 90) {
                // TODO: retrace path backwards
                this.target = this.nearest_deposit;
            }

            // check global resources and determine target resource
            // TODO: temporary - always target carbonite, proper implementation
            // to follow
            // TODO: cache the paths to/from resource

            this.log('  target: ' + this.target);

            if (this.target != null) {
                this.path = this.astar([this.me.x, this.me.y], this.target);
            }

            // proceed to target
            // TODO: handle cases where multiple squares may be moved in a
            // single turn
            // TODO: error checking
            if (this.path != null && this.path.length > 0) {
                var destination = this.take_step(this.path, this.me.unit);
                this.log('  - moving to destination: ('
                    + destination[0] + ', ' + destination[1] + ')');
                return this.move(destination[0] - this.me.x,
                                 destination[1] - this.me.y);
            }
        }

        else if (this.me.unit == SPECS.CRUSADER) {
            this.log('Crusader [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');
        }

        else if (this.me.unit == SPECS.PROPHET) {
            this.log('Prophet [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');
        }

        else if (this.me.unit == SPECS.PREACHER) {
            this.log('Preacher [' + this.me.id + '] health: ' + this.me.health
                + ' at (' + this.me.x + ', ' + this.me.y + ')');
        }
    }

    build_unit(unit, dx, dy) {
        return this.buildUnit(unit, dx, dy);
    }

    castle_talk(value) {
        return this.castleTalk(value);
    }

    get_visible_robots() {
        return this.getVisibleRobots();
    }

    get_visible_robot_map() {
        return this.getVisibleRobotMap();
    }

    get_passable_map() {
        return this.getPassableMap();
    }

    is_passable(x, y) {
        var map = this.map;
        if (0 <= x && x < width && 0 <= y && y < height) {
            return map[y][x];
        }

        return false;
    }

    is_adjacent(square) {
        var ret = Math.abs(this.me.x - square[0]) < 2
            && Math.abs(this.me.y - square[1]) < 2;
        return ret;
    }

    get_adjacent_deposit_point() {
        var visibles = this.get_visible_robots();
        for (var i = 0; i < visibles.length; i++) {
            if (visibles[i].unit < 2) {
                if (this.is_adjacent([visibles[i].x, visibles[i].y])) {
                    return [visibles[i].x, visibles[i].y];
                }
            }
        }

        return null;
    }

    get_adjacent_squares() {
        var width = this.map[0].length;
        var height = this.map.length;

        var adjacent = [];
        for (var i = 0; i < 8; i++) {
            var adjx = this.me.x + this.compass[i][0];
            var adjy = this.me.y + this.compass[i][1];
            if (0 <= adjx && adjx < width
                    && 0 <= adjy && adjy < height) {
                adjacent.push([adjx, adjy]);
            }
        }

        return adjacent;
    }

    get_adjacent_passable_empty_squares() {
        var map = this.map;
        var width = map[0].length;
        var height = map.length;

        var nonempty = this.get_visible_robot_map();

        var adjacent = [];
        for (var i = 0; i < 8; i++) {
            var adjx = this.me.x + this.compass[i][0];
            var adjy = this.me.y + this.compass[i][1];
            if (0 <= adjx && adjx < width
                    && 0 <= adjy && adjy < height
                    && map[adjy][adjx] && !nonempty[adjy][adjx]) {
                adjacent.push([adjx, adjy]);
            }
        }

        return adjacent;
    }

    get_adjacent_passable_squares_at(square) {
        var map = this.map;
        var width = map[0].length;
        var height = map.length;

        var adjacent = [];
        for (var i = 0; i < 8; i++) {
            var adjx = square[0] + this.compass[i][0];
            var adjy = square[1] + this.compass[i][1];
            if (0 <= adjx && adjx < width
                    && 0 <= adjy && adjy < height
                    && map[adjy][adjx]) {
                adjacent.push([adjx, adjy]);
            }
        }

        return adjacent;
    }

    get_adjacent_passable_empty_squares_at(square) {
        var map = this.map;
        var width = map[0].length;
        var height = map.length;

        var nonempty = this.get_visible_robot_map();

        var adjacent = [];
        for (var i = 0; i < 8; i++) {
            var adjx = square[0] + this.compass[i][0];
            var adjy = square[1] + this.compass[i][1];
            if (0 <= adjx && adjx < width
                    && 0 <= adjy && adjy < height
                    && map[adjy][adjx] && !nonempty[adjy][adjx]) {
                adjacent.push([adjx, adjy]);
            }
        }

        return adjacent;
    }

    metric(r, s) {
        return Math.max(Math.abs(r[0] - s[0]), Math.abs(r[1] - s[1]));
    }

    distance(r, s) {
        return (r[0] - s[0]) * (r[0] - s[0]) + (r[1] - s[1]) * (r[1] - s[1]);
    }

    on_resource(resource_map) {
        return resource_map[this.me.y][this.me.x];
    }

    get_resources(resource_map) {
        var width = resource_map[0].length;
        var height = resource_map.length;

        var resources = [];
        for (var i = 0; i < height; i++) {
            for (var j = 0; j < width; j++) {
                if (resource_map[i][j]) {
                    resources.push([j, i]);
                }
            }
        }

        return resources;
    }

    get_nearest_resource(resource_map) {
        var resources = this.get_resources(resource_map);

        // NOTE: assume resources cannot be an empty array
        var closest = resources[0];

        // correct procedure is to perform pathing for each element of this
        // list. probably a good idea to store closest n resource squares
        // permanently
        var now = [this.me.x, this.me.y];
        var min_dist = this.metric(now, resources[0]);
        for (var i = 1; i < resources.length; i++) {
            var dist = this.metric(now, resources[i]);
            if (dist < min_dist) {
                closest = resources[i];
                min_dist = dist;
            }
        }

        return closest;
    }

    astar(start, end) {
        var trace = {};

        var G = {};
        var open_squares = {};

        G[start] = 0;
        open_squares[start] = this.metric(start, end);

        var closed_squares = {};

        while (Object.keys(open_squares).length > 0) {
            var head = null;
            var score = 0;

            for (var square in open_squares) {
                var square_score = parseInt(open_squares[square]);
                if (head == null || square_score < score) {
                    head = JSON.parse('[' + square + ']');
                    score = square_score;
                }
            }

            if (head[0] == end[0] && head[1] == end[1]) {
                var path = [head];
                while (head in trace) {
                    head = trace[head];
                    path.push(head);
                }
                path.reverse();
                path.splice(0, 1);
                return path;
            }

            delete open_squares[head];
            closed_squares[head] = 0;

            var apsquares = this.get_adjacent_passable_empty_squares_at(head);
            for (var i = 0; i < apsquares.length; i++) {
                var square = apsquares[i];

                if (closed_squares[square] == 0) {
                    continue;
                }

                var total = parseInt(G[head]) + this.metric(head, square);

                if (open_squares[square] != undefined
                        && total >= parseInt(G[square])) {
                    continue;
                }

                trace[square] = head;

                G[square] = total;
                open_squares[square] = total + this.metric(square, end);
            }
        }

        this.log('ERROR: no path found!');
        return null;
    }

    take_step(path, speed) {
        const movement_speed = [0, 0, 4, 9, 4, 4];
        const range = movement_speed[this.me.unit];

        var next = null;
        for (var i = 1; i < path.length; i++) {
            if (this.distance([this.me.x, this.me.y], path[i]) > range) {
                next = path[i - 1];
            }
        }

        if (next == null) {
            next = path[path.length - 1];
        }

        return next;
    }
}
