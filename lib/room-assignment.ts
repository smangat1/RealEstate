export type RoomAssignmentMember = {
  id: string;
  name: string;
  budgetMin: number | null;
  idealBudget: number | null;
  budgetMax: number | null;
};

export type RoomAssignmentRoom = {
  id: string;
  name: string;
  /** A relative monthly premium (or discount) for this room, in dollars. */
  adjustment: number;
};

export type RoomAssignmentResult = {
  assignments: Array<{
    memberId: string;
    memberName: string;
    roomId: string;
    roomName: string;
    monthlyRent: number;
    withinComfortRange: boolean;
  }>;
  totalRent: number;
  warnings: string[];
  method: "affordability_balanced";
};

function permutations<T>(values: T[]): T[][] {
  if (values.length <= 1) return [values];
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += 1) {
    const head = values[index];
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const tail of permutations(rest)) result.push([head, ...tail]);
  }
  return result;
}

function roomRents(totalRent: number, rooms: RoomAssignmentRoom[]) {
  const averageAdjustment = rooms.reduce((sum, room) => sum + room.adjustment, 0) / rooms.length;
  const raw = rooms.map((room) => totalRent / rooms.length + room.adjustment - averageAdjustment);
  const rounded = raw.map((rent) => Math.max(0, Math.round(rent)));
  const delta = totalRent - rounded.reduce((sum, rent) => sum + rent, 0);
  rounded[0] += delta;
  return rounded;
}

function assignmentCost(member: RoomAssignmentMember, rent: number) {
  const ideal = member.idealBudget ?? member.budgetMax ?? member.budgetMin ?? rent;
  const scale = Math.max(ideal, 1);
  let cost = ((rent - ideal) / scale) ** 2;
  if (member.budgetMax !== null && rent > member.budgetMax) {
    cost += 100 + ((rent - member.budgetMax) / Math.max(member.budgetMax, 1)) * 100;
  }
  if (member.budgetMin !== null && rent < member.budgetMin) {
    cost += 5 + ((member.budgetMin - rent) / Math.max(member.budgetMin, 1)) * 10;
  }
  return cost;
}

export function optimizeRoomAssignment(input: {
  totalRent: number;
  members: RoomAssignmentMember[];
  rooms: RoomAssignmentRoom[];
}): RoomAssignmentResult {
  if (!Number.isInteger(input.totalRent) || input.totalRent <= 0) {
    throw new Error("Total rent must be a positive whole-dollar amount.");
  }
  if (input.members.length < 2 || input.members.length !== input.rooms.length) {
    throw new Error("Add exactly one room for each roommate.");
  }
  if (input.members.length > 7) {
    throw new Error("Room assignment supports up to seven roommates.");
  }

  const rents = roomRents(input.totalRent, input.rooms);
  const arrangements = permutations(input.members);
  let best = arrangements[0];
  let bestCost = Number.POSITIVE_INFINITY;
  for (const arrangement of arrangements) {
    const cost = arrangement.reduce((sum, member, roomIndex) => sum + assignmentCost(member, rents[roomIndex]), 0);
    if (cost < bestCost) {
      best = arrangement;
      bestCost = cost;
    }
  }

  const assignments = input.rooms.map((room, index) => {
    const member = best[index];
    const monthlyRent = rents[index];
    return {
      memberId: member.id,
      memberName: member.name,
      roomId: room.id,
      roomName: room.name,
      monthlyRent,
      withinComfortRange:
        (member.budgetMin === null || monthlyRent >= member.budgetMin)
        && (member.budgetMax === null || monthlyRent <= member.budgetMax),
    };
  });
  const warnings: string[] = [];
  const outside = assignments.filter((assignment) => !assignment.withinComfortRange);
  if (outside.length > 0) warnings.push(`${outside.length} assignment${outside.length === 1 ? " is" : "s are"} outside a stated comfort range.`);
  if (input.members.some((member) => member.idealBudget === null && member.budgetMax === null)) {
    warnings.push("Some roommates have not supplied a private budget range, so their assignment uses the equal-share baseline.");
  }
  warnings.push("Room premiums are group estimates; confirm the split together before anyone pays or signs.");

  return { assignments, totalRent: input.totalRent, warnings, method: "affordability_balanced" };
}
