---
name: drawing
description: Path, Paint, and Renderer APIs for procedural drawing in Rive scripts
metadata:
  tags: rive, scripting, drawing, path, paint, renderer, graphics
---

# Drawing in Rive Scripts

Rive provides powerful APIs for procedural drawing: Path for vector shapes, Paint for styling, and Renderer for drawing operations.

## Path API

Paths define vector shapes using move, line, and curve commands.

### Creating Paths

```lua
local path = Path.new()
```

### Path Commands

```lua
path:reset()                           -- Clear all commands
path:moveTo(Vec2D.xy(x, y))           -- Move without drawing
path:lineTo(Vec2D.xy(x, y))           -- Line to point
path:quadTo(Vec2D.xy(cx, cy), Vec2D.xy(x, y))  -- Quadratic curve
path:cubicTo(Vec2D.xy(c1x, c1y), Vec2D.xy(c2x, c2y), Vec2D.xy(x, y))  -- Cubic curve
path:close()                           -- Close path to start
```

### Shape Helpers

```lua
-- Rectangle
path:addRect(AABB.xywh(x, y, width, height))

-- Rounded rectangle
path:addRoundedRect(AABB.xywh(x, y, w, h), cornerRadius)

-- Oval/circle
path:addOval(AABB.xywh(x, y, width, height))

-- Circle (shorthand)
local radius = 50
path:addOval(AABB.xywh(-radius, -radius, radius * 2, radius * 2))
```

### Path Operations

```lua
-- Combine paths
path:addPath(otherPath)

-- Transform path
path:transform(Mat2D.fromScale(2, 2))
```

## Paint API

Paint controls how paths are rendered (fill, stroke, color, gradient).

### Creating Paint

```lua
local paint = Paint.new()
```

### Fill vs Stroke

```lua
paint:setStyle(PaintStyle.fill)    -- Filled shape
paint:setStyle(PaintStyle.stroke)  -- Outlined shape

-- Stroke options
paint:setThickness(3)              -- Line width
paint:setStrokeCap(StrokeCap.round)    -- round, butt, square
paint:setStrokeJoin(StrokeJoin.round)  -- round, miter, bevel
```

### Colors

```lua
-- RGB (0-255)
paint:setColor(Color.rgb(255, 100, 50))

-- RGBA with alpha (0-255)
paint:setColor(Color.rgba(255, 100, 50, 128))

-- Color interpolation
local c1 = Color.rgb(255, 0, 0)
local c2 = Color.rgb(0, 0, 255)
local mixed = Color.lerp(c1, c2, 0.5) -- Purple
```

### Gradients

```lua
-- Linear gradient
local gradient = Gradient.linear(
  Vec2D.xy(0, 0),      -- Start point
  Vec2D.xy(100, 100),  -- End point
  {                    -- Color stops
    {0, Color.rgb(255, 0, 0)},    -- Red at 0%
    {0.5, Color.rgb(255, 255, 0)}, -- Yellow at 50%
    {1, Color.rgb(0, 255, 0)},    -- Green at 100%
  }
)
paint:setGradient(gradient)

-- Radial gradient
local radial = Gradient.radial(
  Vec2D.xy(50, 50),    -- Center
  50,                  -- Radius
  {
    {0, Color.rgb(255, 255, 255)},  -- White at center
    {1, Color.rgb(0, 0, 0)},        -- Black at edge
  }
)
paint:setGradient(radial)
```

### Blend Modes

```lua
-- Set blend mode on paint
paint:setBlendMode('srcOver')     -- Default: source over destination

-- All available blend modes:
'srcOver'      -- Normal compositing (default)
'screen'       -- Lightens, useful for glows
'overlay'      -- Combines multiply and screen
'darken'       -- Keeps darker pixels
'lighten'      -- Keeps lighter pixels
'colorDodge'   -- Brightens to reflect source
'colorBurn'    -- Darkens to reflect source
'hardLight'    -- Like overlay but harsher
'softLight'    -- Subtle lighting effect
'difference'   -- Subtracts colors
'exclusion'    -- Like difference but lower contrast
'multiply'     -- Darkens by multiplying
'hue'          -- Source hue, dest saturation/luminosity
'saturation'   -- Source saturation, dest hue/luminosity
'color'        -- Source hue/saturation, dest luminosity
'luminosity'   -- Source luminosity, dest hue/saturation
```

## Renderer API

The Renderer draws paths and handles transformations.

### Drawing

```lua
function draw(self: MyNode, renderer: Renderer)
  renderer:drawPath(self.path, self.paint)
end
```

### Transformations

Always use save/restore when transforming:

```lua
function draw(self: MyNode, renderer: Renderer)
  renderer:save()

  -- Apply transforms
  renderer:translate(Vec2D.xy(100, 100))
  renderer:rotate(math.pi / 4)  -- 45 degrees in radians
  renderer:scale(Vec2D.xy(2, 2))

  -- Or use a matrix
  renderer:transform(Mat2D.fromRotation(self.angle))

  renderer:drawPath(self.path, self.paint)

  renderer:restore()
end
```

### Clipping

```lua
function draw(self: MyNode, renderer: Renderer)
  renderer:save()

  -- Create clip path
  local clipPath = Path.new()
  clipPath:addOval(AABB.xywh(0, 0, 100, 100))
  renderer:clipPath(clipPath)

  -- Only draws within the circle
  renderer:drawPath(self.path, self.paint)

  renderer:restore()
end
```

## Complete Examples

### Procedural Star

```lua
type Star = {
  path: Path,
  paint: Paint,
  points: number,
  outerRadius: number,
  innerRadius: number,
}

function draw(self: Star, renderer: Renderer)
  self.path:reset()

  local points = self.points
  local outer = self.outerRadius
  local inner = self.innerRadius

  for i = 0, points * 2 - 1 do
    local angle = (i * math.pi / points) - math.pi / 2
    local radius = if i % 2 == 0 then outer else inner
    local x = math.cos(angle) * radius
    local y = math.sin(angle) * radius

    if i == 0 then
      self.path:moveTo(Vec2D.xy(x, y))
    else
      self.path:lineTo(Vec2D.xy(x, y))
    end
  end
  self.path:close()

  renderer:drawPath(self.path, self.paint)
end

return function(): Node<Star>
  local paint = Paint.new()
  paint:setColor(Color.rgb(255, 200, 50))

  return {
    draw = draw,
    path = Path.new(),
    paint = paint,
    points = 5,
    outerRadius = 50,
    innerRadius = 20,
  }
end
```

### Animated Wave

```lua
type Wave = {
  path: Path,
  paint: Paint,
  time: number,
  amplitude: number,
  frequency: number,
  width: number,
}

function advance(self: Wave, elapsed: number)
  self.time = self.time + elapsed
end

function draw(self: Wave, renderer: Renderer)
  self.path:reset()

  local segments = 50
  for i = 0, segments do
    local x = (i / segments) * self.width
    local y = math.sin((x * self.frequency) + self.time * 3) * self.amplitude

    if i == 0 then
      self.path:moveTo(Vec2D.xy(x, y))
    else
      self.path:lineTo(Vec2D.xy(x, y))
    end
  end

  renderer:drawPath(self.path, self.paint)
end

return function(): Node<Wave>
  local paint = Paint.new()
  paint:setStyle(PaintStyle.stroke)
  paint:setThickness(3)
  paint:setColor(Color.rgb(100, 150, 255))

  return {
    advance = advance,
    draw = draw,
    path = Path.new(),
    paint = paint,
    time = 0,
    amplitude = 30,
    frequency = 0.05,
    width = 300,
  }
end
```

### Gradient Button

```lua
type GradientButton = {
  path: Path,
  paint: Paint,
  width: number,
  height: number,
  cornerRadius: number,
}

function init(self: GradientButton)
  local gradient = Gradient.linear(
    Vec2D.xy(0, 0),
    Vec2D.xy(0, self.height),
    {
      {0, Color.rgb(100, 200, 255)},
      {1, Color.rgb(50, 100, 200)},
    }
  )
  self.paint:setGradient(gradient)
end

function draw(self: GradientButton, renderer: Renderer)
  self.path:reset()
  self.path:addRoundedRect(
    AABB.xywh(0, 0, self.width, self.height),
    self.cornerRadius
  )
  renderer:drawPath(self.path, self.paint)
end

return function(): Node<GradientButton>
  return {
    init = init,
    draw = draw,
    path = Path.new(),
    paint = Paint.new(),
    width = 200,
    height = 50,
    cornerRadius = 10,
  }
end
```

## Best Practices

1. **Create Path/Paint in factory** - Never in draw()
2. **Reset path each frame** - Call `path:reset()` at start of draw
3. **Use save/restore** - Always wrap transforms
4. **Radians for angles** - Use `math.rad(degrees)` if needed
5. **Center shapes at origin** - Makes rotation intuitive

## Common Pitfalls

**Degrees vs radians**
```lua
-- Bad: thinking in degrees
renderer:rotate(45) -- This is 45 radians!

-- Good: convert or use radians
renderer:rotate(math.rad(45)) -- 45 degrees
renderer:rotate(math.pi / 4)  -- Also 45 degrees
```

**Gradient coordinates**
```lua
-- Gradients use local coordinates
-- If drawing at (100, 100), gradient still starts at (0, 0)
local gradient = Gradient.linear(
  Vec2D.xy(0, 0),      -- Local origin
  Vec2D.xy(self.width, 0),  -- Relative to shape
  {...}
)
```
