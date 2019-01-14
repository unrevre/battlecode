from battlecode import BCAbstractRobot, SPECS

import battlecode as bc
import random

import astar

__pragma__('iconv')
__pragma__('tconv')
__pragma__('opov')

# don't try to use global variables!!

class MyRobot(BCAbstractRobot):
    """ main class for battlecode 19 """

    step = -1

    directions = [
        (0, -1), (1, -1), (1, 0), (1, 1),
        (0, 1), (-1, 1), (-1, 0), (-1, -1)
        ]

    nearest_deposit = None

    nearest_karbonite = None
    nearest_fuel = None

    graph = None
    target = None
    path = None

    def turn(self):
        """ executed per robot turn """

        self.step += 1
        self.log("START TURN " + self.step)

        if self.me['unit'] == SPECS['CASTLE']:
            self.log("Castle [{}] health: {}".format(
                self.me.id, self.me.health))

            if self.step < 10:
                buildable = self.adjacent_empty_passable()
                if buildable:
                    return self.build_unit(SPECS['PILGRIM'],
                                           buildable[0][0] - self.me.x,
                                           buildable[0][1] - self.me.y)

        elif self.me['unit'] == SPECS['CHURCH']:
            self.log("Church [{}] health: {}".format(
                self.me.id, self.me.health))
            pass

        elif self.me['unit'] == SPECS['PILGRIM']:
            self.log("Pilgrim [{}] health: {}".format(
                self.me.id, self.me.health))

            # save birthplace as nearest deposit time
            if self.step == 0:
                self.graph = astar.Graph(self.map)
                self.nearest_deposit = self.adjacent_deposit_point()
                # could be spread out over first few turns if necessary
            if self.step == 1:
                self.nearest_karbonite = self.get_nearest_resource(
                    self.karbonite_map)
            if self.step == 2:
                self.nearest_fuel = self.get_nearest_resource(self.fuel_map)

            if self.step == 3:
                self.target = self.nearest_karbonite
                self.path = astar.astar(
                    self.graph, (self.me.x, self.me.y), self.target)

            # TODO: check for attacking units and check distance to deposit
            # point
            # TODO: evade attackers if possible - be careful here not to be
            # overly scared

            # mine resources if safe and appropriate
            if self.on_resource(self.karbonite_map) and self.me.karbonite < 19:
                return self.mine()

            if self.on_resource(self.fuel_map) and self.me.fuel < 91:
                return self.mine()

            # always check and update for adjacent deposit points
            # possible to try to build churches in the path between the
            # resource and the original 'birth' castle/church

            if (self.is_adjacent(self.nearest_deposit)
                    and (self.me.karbonite or self.me.fuel)):
                return self.give(self.nearest_deposit[0] - self.me.x,
                                 self.nearest_deposit[1] - self.me.y,
                                 self.me.karbonite, self.me.fuel)

            # return to 'birth' castle/church
            if self.me.karbonite > 18 or self.me.fuel > 90:
                # TODO: retrace path backwards
                self.target = self.nearest_deposit
                self.path = astar.astar(
                    self.graph, (self.me.x, self.me.y), self.target)

            # check global resources and determine target resource
            # TODO: temporary - always target carbonite, proper implementation
            # to follow
            # TODO: cache the paths to/from resource

            if self.target is not None:
                self.path = astar.astar(
                    self.graph, (self.me.x, self.me.y), self.target)
            else:
                self.path = [random.choice(self.directions)]

            # proceed to target
            # TODO: handle cases where multiple squares may be moved in a
            # single turn
            # TODO: error checking
            if self.path:
                direction = self.path.pop(0)
                return self.move((direction[0] - self.me.x,
                                  direction[1] - self.me.y))

        elif self.me['unit'] == SPECS['CRUSADER']:
            pass

        elif self.me['unit'] == SPECS['PROPHET']:
            pass

        elif self.me['unit'] == SPECS['PREACHER']:
            pass

    def is_adjacent(self, unit):
        """ check if unit is adjacent """

        return abs(self.me.x - unit.x) < 2 and abs(self.me.y - unit.y) < 2

    def adjacent_deposit_point(self):
        """ return adjacent deposit point (castle/church), if it exists

        to be called when a pilgrim is created
        """

        deposit = next(r for r in self.get_visible_robots() if r.unit < 2)
        if self.is_adjacent(deposit):
            return (deposit.x, deposit.y)

    def get_adjacent_squares(self):
        """ return adjacent squares """

        width = len(self.map)
        height = len(self.map[0])

        return [(self.me.x + d[0], self.me.y + d[1]) for d in self.directions
                if 0 <= self.me.x + d[0] < width
                and 0 <= self.me.y + d[1] < height]

    def adjacent_empty_passable(self):
        """ return adjacent buildable (empty, passable) square """

        squares = self.get_adjacent_squares()
        passable = self.get_passable_map()
        robots = self.get_visible_robot_map()

        return [s for s in squares if
                passable[s[0]][s[1]] and not robots[s[0]][s[1]]]

    def on_resource(self, resource_map):
        """ check if current square contains resources """

        return resource_map[self.me.x][self.me.y]

    def get_nearest_resource(self, resource_map):
        """ find nearest resource square

        to be called from resource deposition points (castle/church)
        """

        distances = [(x - self.me.x, y - self.me.y)
                     for x, row in enumerate(resource_map)
                     for y, _ in enumerate(row)
                     if resource_map[x][y]]

        # correct procedure is to perform an A* search for each element of this
        # list. probably a good idea to store closest n resource squares
        # permanently
        return min(distances, key=lambda r, s: min(abs(r, s)))


robot = MyRobot()
