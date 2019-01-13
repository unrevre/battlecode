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

    def turn(self):
        """ executed per robot turn """

        self.step += 1
        # self.log("START TURN " + self.step)

        if self.me['unit'] == SPECS['CASTLE']:
            if self.step < 10:
                # self.log("Building a crusader at " + str(self.me['x']+1)
                #     + ", " + str(self.me['y']+1))
                return self.build_unit(SPECS['CRUSADER'], 1, 1)

            # self.log("Castle health: " + self.me['health'])
            pass

        elif self.me['unit'] == SPECS['CHURCH']:
            pass

        elif self.me['unit'] == SPECS['PILGRIM']:
            # minor optimisation: save 'birth' castle/church id
            deposit = next(r for r in self.get_visible_robots() if r.unit < 2)
            if is_adjacent(deposit) and (self.me.karbonite or self.me.fuel):
                return self.give(deposit.x - self.me.x, deposit.y - self.me.y,
                                 self.me.karbonite, self.me.fuel)

        elif self.me['unit'] == SPECS['CRUSADER']:
            # self.log("Crusader health: " + str(self.me['health']))
            direction = random.choice(directions)
            # self.log('TRYING TO MOVE IN DIRECTION ' + str(direction))
            return self.move(*choice)

        elif self.me['unit'] == SPECS['PROPHET']:
            pass

        elif self.me['unit'] == SPECS['PREACHER']:
            pass

    def is_adjacent(self, unit):
        """ check if unit is adjacent """

        return max((abs(self.me.x - unit.x), abs(self.me.y - unit.y))) < 2

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
