---
name: path-effects
description: PathEffect protocol for procedural path manipulation and effects
metadata:
  tags: rive, scripting, path-effects, procedural, graphics
---

# PathEffect Scripts

PathEffect scripts modify paths procedurally, enabling effects like dashes, distortions, and decorations.

## PathEffect Protocol

```lua
type DashEffect = {
  dashLength: number,
  gapLength: number,
}

function effect(self: DashEffect, source: PathData): PathData
  -- Transform the path data
  return createDashedPath(source, self.dashLength, self.gapLength)
end

return function(): PathEffect<DashEffect>
  return {
    effect = effect,
    dashLength = 10,
    gapLength = 5,
  }
end
```

## PathData Structure

`PathData` contains path geometry you can read and modify:

```lua
-- PathData provides:
-- - verbs: Array of path commands (moveTo, lineTo, etc.)
-- - points: Array of Vec2D points
-- - contours: Separate sub-paths

function effect(self, source: PathData): PathData
  local result = PathData.new()

  -- Iterate through contours
  for _, contour in source:contours() do
    -- Iterate through segments
    for segment in contour:segments() do
      -- segment.type: "moveTo", "lineTo", "quadTo", "cubicTo", "close"
      -- segment.points: Array of Vec2D
    end
  end

  return result
end
```

## ContourMeasure

Measure path length and sample points along paths:

```lua
function effect(self, source: PathData): PathData
  local result = PathData.new()

  for _, contour in source:contours() do
    local measure = ContourMeasure.new(contour)
    local length = measure:length()

    -- Sample points along the path
    for i = 0, 10 do
      local t = i / 10
      local distance = t * length
      local point = measure:getPosition(distance)
      local tangent = measure:getTangent(distance)

      -- Use point and tangent
    end
  end

  return result
end
```

## PathEffect Examples

### Dash Effect

Creates a dashed line:

```lua
type Dash = {
  dashLength: number,
  gapLength: number,
}

function effect(self: Dash, source: PathData): PathData
  local result = PathData.new()

  for _, contour in source:contours() do
    local measure = ContourMeasure.new(contour)
    local length = measure:length()

    local distance = 0
    local isDash = true

    while distance < length do
      if isDash then
        local dashEnd = math.min(distance + self.dashLength, length)
        local startPos = measure:getPosition(distance)
        local endPos = measure:getPosition(dashEnd)

        result:moveTo(startPos)
        result:lineTo(endPos)

        distance = dashEnd
      else
        distance = distance + self.gapLength
      end
      isDash = not isDash
    end
  end

  return result
end

return function(): PathEffect<Dash>
  return {
    effect = effect,
    dashLength = 15,
    gapLength = 8,
  }
end
```

### Zigzag Effect

Converts straight lines to zigzag:

```lua
type Zigzag = {
  amplitude: number,
  frequency: number,
}

function effect(self: Zigzag, source: PathData): PathData
  local result = PathData.new()

  for _, contour in source:contours() do
    local measure = ContourMeasure.new(contour)
    local length = measure:length()
    local step = length / (self.frequency * 2)

    local startPos = measure:getPosition(0)
    result:moveTo(startPos)

    for i = 1, self.frequency * 2 do
      local distance = i * step
      local pos = measure:getPosition(distance)
      local tangent = measure:getTangent(distance)

      -- Calculate perpendicular offset
      local perpendicular = Vec2D.xy(-tangent.y, tangent.x)
      local offset = if i % 2 == 1 then self.amplitude else -self.amplitude

      local zigPoint = Vec2D.xy(
        pos.x + perpendicular.x * offset,
        pos.y + perpendicular.y * offset
      )

      result:lineTo(zigPoint)
    end
  end

  return result
end

return function(): PathEffect<Zigzag>
  return {
    effect = effect,
    amplitude = 10,
    frequency = 8,
  }
end
```

### Wave Distortion

Applies sine wave to path:

```lua
type Wave = {
  amplitude: number,
  wavelength: number,
  phase: number,
}

function effect(self: Wave, source: PathData): PathData
  local result = PathData.new()

  for _, contour in source:contours() do
    local measure = ContourMeasure.new(contour)
    local length = measure:length()
    local samples = math.ceil(length / 2) -- Sample every 2 units

    for i = 0, samples do
      local t = i / samples
      local distance = t * length
      local pos = measure:getPosition(distance)
      local tangent = measure:getTangent(distance)

      -- Perpendicular direction
      local perp = Vec2D.xy(-tangent.y, tangent.x)

      -- Sine wave offset
      local wave = math.sin((distance / self.wavelength) * math.pi * 2 + self.phase)
      local offset = wave * self.amplitude

      local newPoint = Vec2D.xy(
        pos.x + perp.x * offset,
        pos.y + perp.y * offset
      )

      if i == 0 then
        result:moveTo(newPoint)
      else
        result:lineTo(newPoint)
      end
    end
  end

  return result
end

return function(): PathEffect<Wave>
  return {
    effect = effect,
    amplitude = 5,
    wavelength = 20,
    phase = 0,
  }
end
```

### Rough/Sketch Effect

Adds hand-drawn feel:

```lua
type Rough = {
  jitter: number,
  seed: number,
}

local function pseudoRandom(seed: number): number
  -- Simple PRNG
  local x = math.sin(seed * 12.9898) * 43758.5453
  return x - math.floor(x)
end

function effect(self: Rough, source: PathData): PathData
  local result = PathData.new()
  local seed = self.seed

  for _, contour in source:contours() do
    local measure = ContourMeasure.new(contour)
    local length = measure:length()
    local step = 3 -- Sample every 3 units
    local samples = math.ceil(length / step)

    for i = 0, samples do
      local t = i / samples
      local distance = t * length
      local pos = measure:getPosition(distance)

      -- Add random jitter
      seed = seed + 1
      local jitterX = (pseudoRandom(seed) - 0.5) * 2 * self.jitter
      seed = seed + 1
      local jitterY = (pseudoRandom(seed) - 0.5) * 2 * self.jitter

      local newPoint = Vec2D.xy(pos.x + jitterX, pos.y + jitterY)

      if i == 0 then
        result:moveTo(newPoint)
      else
        result:lineTo(newPoint)
      end
    end
  end

  return result
end

return function(): PathEffect<Rough>
  return {
    effect = effect,
    jitter = 2,
    seed = 42,
  }
end
```

### Outline Effect

Creates parallel offset paths:

```lua
type Outline = {
  offset: number,
}

function effect(self: Outline, source: PathData): PathData
  local result = PathData.new()

  for _, contour in source:contours() do
    local measure = ContourMeasure.new(contour)
    local length = measure:length()
    local samples = math.ceil(length / 2)

    -- Outer path
    for i = 0, samples do
      local distance = (i / samples) * length
      local pos = measure:getPosition(distance)
      local tangent = measure:getTangent(distance)
      local perp = Vec2D.xy(-tangent.y, tangent.x)

      local outer = Vec2D.xy(
        pos.x + perp.x * self.offset,
        pos.y + perp.y * self.offset
      )

      if i == 0 then
        result:moveTo(outer)
      else
        result:lineTo(outer)
      end
    end

    -- Inner path (reversed)
    for i = samples, 0, -1 do
      local distance = (i / samples) * length
      local pos = measure:getPosition(distance)
      local tangent = measure:getTangent(distance)
      local perp = Vec2D.xy(-tangent.y, tangent.x)

      local inner = Vec2D.xy(
        pos.x - perp.x * self.offset,
        pos.y - perp.y * self.offset
      )

      result:lineTo(inner)
    end

    result:close()
  end

  return result
end

return function(): PathEffect<Outline>
  return {
    effect = effect,
    offset = 5,
  }
end
```

### Animated Path Effect

Animate with time (use with Node script):

```lua
type AnimatedDash = {
  dashLength: number,
  gapLength: number,
  offset: number,  -- Updated by advance()
}

function advance(self: AnimatedDash, elapsed: number)
  self.offset = self.offset + elapsed * 50  -- 50 units per second

  -- Loop the offset
  local cycle = self.dashLength + self.gapLength
  if self.offset > cycle then
    self.offset = self.offset - cycle
  end
end

function effect(self: AnimatedDash, source: PathData): PathData
  -- Use self.offset to animate dash position
  -- Similar to Dash but start at offset
  ...
end

return function(): PathEffect<AnimatedDash>
  return {
    advance = advance,
    effect = effect,
    dashLength = 15,
    gapLength = 8,
    offset = 0,
  }
end
```

## Best Practices

1. **Sample appropriately** - More samples = smoother curves but slower
2. **Handle closed paths** - Check if contour is closed and handle endpoints
3. **Preserve winding** - Maintain path direction for fills
4. **Use ContourMeasure** - For accurate length-based sampling
5. **Cache calculations** - Don't recalculate unless path changes

## Common Pitfalls

**Too few samples**
```lua
-- Bad: only 10 samples for long path
local samples = 10

-- Good: sample based on path length
local samples = math.ceil(length / 2)
```

**Not handling multiple contours**
```lua
-- Bad: assumes single contour
function effect(self, source: PathData): PathData
  local measure = ContourMeasure.new(source:contours()[1])
  ...
end

-- Good: iterate all contours
function effect(self, source: PathData): PathData
  for _, contour in source:contours() do
    local measure = ContourMeasure.new(contour)
    ...
  end
end
```

**Division by zero**
```lua
-- Bad: crashes on zero-length path
local step = length / samples

-- Good: check for zero length
if length < 0.001 then
  return source
end
```
