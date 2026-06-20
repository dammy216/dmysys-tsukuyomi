---
name: layout-scripts
description: Layout protocol for custom sizing and positioning of Rive elements
metadata:
  tags: rive, scripting, layout, sizing, positioning
---

# Layout Scripts

Layout scripts control how Rive elements are sized and positioned. They extend the Node protocol with layout-specific methods.

## Layout Protocol

```lua
type MyLayout = {
  path: Path,
  paint: Paint,
  idealSize: Vec2D,
  actualSize: Vec2D,
}

-- Return the ideal size for this element
function measure(self: MyLayout, availableWidth: number, availableHeight: number): Vec2D
  -- Calculate ideal size given available space
  return self.idealSize
end

-- Called when the actual size is determined
function resize(self: MyLayout, width: number, height: number)
  self.actualSize = Vec2D.xy(width, height)
end

-- Standard Node methods also available
function draw(self: MyLayout, renderer: Renderer)
  self.path:reset()
  self.path:addRect(AABB.xywh(0, 0, self.actualSize.x, self.actualSize.y))
  renderer:drawPath(self.path, self.paint)
end

return function(): Layout<MyLayout>
  return {
    measure = measure,
    resize = resize,
    draw = draw,
    path = Path.new(),
    paint = Paint.new(),
    idealSize = Vec2D.xy(100, 100),
    actualSize = Vec2D.xy(100, 100),
  }
end
```

## Measure Method

`measure` is called to determine the element's preferred size:

```lua
function measure(self: MyLayout, availableWidth: number, availableHeight: number): Vec2D
  -- availableWidth/availableHeight may be:
  -- - A specific value (parent wants to constrain)
  -- - math.huge (no constraint, use ideal size)

  if availableWidth == math.huge then
    -- Use our preferred width
    return Vec2D.xy(self.preferredWidth, self.preferredHeight)
  else
    -- Fit within constraints
    return Vec2D.xy(
      math.min(self.preferredWidth, availableWidth),
      math.min(self.preferredHeight, availableHeight)
    )
  end
end
```

## Resize Method

`resize` is called when the final size is determined:

```lua
function resize(self: MyLayout, width: number, height: number)
  -- Store the actual size for drawing
  self.width = width
  self.height = height

  -- Update any size-dependent state
  self.gradient = Gradient.linear(
    Vec2D.xy(0, 0),
    Vec2D.xy(width, 0),
    self.colorStops
  )
end
```

## Layout Examples

### Aspect Ratio Layout

Maintains a fixed aspect ratio:

```lua
type AspectRatio = {
  path: Path,
  paint: Paint,
  ratio: number,  -- width / height
  size: Vec2D,
}

function measure(self: AspectRatio, availableWidth: number, availableHeight: number): Vec2D
  if availableWidth == math.huge and availableHeight == math.huge then
    -- No constraints, use default
    return Vec2D.xy(100, 100 / self.ratio)
  elseif availableWidth == math.huge then
    -- Height constrained
    return Vec2D.xy(availableHeight * self.ratio, availableHeight)
  elseif availableHeight == math.huge then
    -- Width constrained
    return Vec2D.xy(availableWidth, availableWidth / self.ratio)
  else
    -- Both constrained, fit within
    local w1 = availableWidth
    local h1 = availableWidth / self.ratio

    local h2 = availableHeight
    local w2 = availableHeight * self.ratio

    if h1 <= availableHeight then
      return Vec2D.xy(w1, h1)
    else
      return Vec2D.xy(w2, h2)
    end
  end
end

function resize(self: AspectRatio, width: number, height: number)
  self.size = Vec2D.xy(width, height)
end

function draw(self: AspectRatio, renderer: Renderer)
  self.path:reset()
  self.path:addRect(AABB.xywh(0, 0, self.size.x, self.size.y))
  renderer:drawPath(self.path, self.paint)
end

return function(): Layout<AspectRatio>
  local paint = Paint.new()
  paint:setColor(Color.rgb(100, 150, 200))

  return {
    measure = measure,
    resize = resize,
    draw = draw,
    path = Path.new(),
    paint = paint,
    ratio = 16 / 9,
    size = Vec2D.xy(100, 56.25),
  }
end
```

### Min/Max Size Layout

Enforces minimum and maximum sizes:

```lua
type BoundedSize = {
  path: Path,
  paint: Paint,
  minSize: Vec2D,
  maxSize: Vec2D,
  size: Vec2D,
}

function measure(self: BoundedSize, availableWidth: number, availableHeight: number): Vec2D
  local width = math.max(self.minSize.x, math.min(self.maxSize.x, availableWidth))
  local height = math.max(self.minSize.y, math.min(self.maxSize.y, availableHeight))
  return Vec2D.xy(width, height)
end

function resize(self: BoundedSize, width: number, height: number)
  self.size = Vec2D.xy(width, height)
end

function draw(self: BoundedSize, renderer: Renderer)
  self.path:reset()
  self.path:addRect(AABB.xywh(0, 0, self.size.x, self.size.y))
  renderer:drawPath(self.path, self.paint)
end

return function(): Layout<BoundedSize>
  local paint = Paint.new()
  paint:setColor(Color.rgb(150, 100, 200))

  return {
    measure = measure,
    resize = resize,
    draw = draw,
    path = Path.new(),
    paint = paint,
    minSize = Vec2D.xy(50, 50),
    maxSize = Vec2D.xy(300, 200),
    size = Vec2D.xy(100, 100),
  }
end
```

### Responsive Text Layout

Adjusts based on available space:

```lua
type ResponsiveContent = {
  path: Path,
  smallPaint: Paint,
  largePaint: Paint,
  size: Vec2D,
  isCompact: boolean,
}

function measure(self: ResponsiveContent, availableWidth: number, availableHeight: number): Vec2D
  -- Check if we need compact mode
  self.isCompact = availableWidth < 200

  if self.isCompact then
    return Vec2D.xy(100, 50)
  else
    return Vec2D.xy(200, 100)
  end
end

function resize(self: ResponsiveContent, width: number, height: number)
  self.size = Vec2D.xy(width, height)
end

function draw(self: ResponsiveContent, renderer: Renderer)
  local paint = if self.isCompact then self.smallPaint else self.largePaint

  self.path:reset()
  self.path:addRoundedRect(AABB.xywh(0, 0, self.size.x, self.size.y), 8)
  renderer:drawPath(self.path, paint)
end

return function(): Layout<ResponsiveContent>
  local smallPaint = Paint.new()
  smallPaint:setColor(Color.rgb(255, 150, 100))

  local largePaint = Paint.new()
  largePaint:setColor(Color.rgb(100, 200, 150))

  return {
    measure = measure,
    resize = resize,
    draw = draw,
    path = Path.new(),
    smallPaint = smallPaint,
    largePaint = largePaint,
    size = Vec2D.xy(200, 100),
    isCompact = false,
  }
end
```

### Grid Layout

Positions children in a grid:

```lua
type GridLayout = {
  columns: number,
  gap: number,
  cellSize: Vec2D,
  size: Vec2D,
}

function measure(self: GridLayout, availableWidth: number, availableHeight: number): Vec2D
  local childCount = #self.children
  local rows = math.ceil(childCount / self.columns)

  local width = self.columns * self.cellSize.x + (self.columns - 1) * self.gap
  local height = rows * self.cellSize.y + (rows - 1) * self.gap

  return Vec2D.xy(width, height)
end

function resize(self: GridLayout, width: number, height: number)
  self.size = Vec2D.xy(width, height)

  -- Position children
  for i, child in ipairs(self.children) do
    local index = i - 1
    local col = index % self.columns
    local row = math.floor(index / self.columns)

    local x = col * (self.cellSize.x + self.gap)
    local y = row * (self.cellSize.y + self.gap)

    child:setPosition(Vec2D.xy(x, y))
    child:setSize(self.cellSize)
  end
end

return function(): Layout<GridLayout>
  return {
    measure = measure,
    resize = resize,
    columns = 3,
    gap = 10,
    cellSize = Vec2D.xy(100, 100),
    size = Vec2D.xy(0, 0),
  }
end
```

## Best Practices

1. **Handle math.huge** - Check for unconstrained dimensions
2. **Store actual size** - Use resize to save the final size
3. **Return reasonable defaults** - measure should return valid sizes
4. **Consider aspect ratio** - Maintain proportions when constrained
5. **Update dependent state** - Recalculate gradients, positions in resize

## Common Pitfalls

**Ignoring constraints**
```lua
-- Bad: ignores available space
function measure(self, availableWidth, availableHeight): Vec2D
  return Vec2D.xy(500, 500) -- Always returns fixed size
end

-- Good: respects constraints
function measure(self, availableWidth, availableHeight): Vec2D
  return Vec2D.xy(
    math.min(500, availableWidth),
    math.min(500, availableHeight)
  )
end
```

**Not updating state in resize**
```lua
-- Bad: uses measure size for drawing
function draw(self, renderer)
  -- Uses idealSize, not actual size
  self.path:addRect(AABB.xywh(0, 0, self.idealSize.x, self.idealSize.y))
end

-- Good: uses actual size from resize
function resize(self, width, height)
  self.actualSize = Vec2D.xy(width, height)
end

function draw(self, renderer)
  self.path:addRect(AABB.xywh(0, 0, self.actualSize.x, self.actualSize.y))
end
```

**Returning Layout instead of Layout<T>**
```lua
-- Bad: missing type parameter
return function(): Layout
  return { measure = measure, resize = resize }
end

-- Good: typed return
return function(): Layout<MyLayout>
  return { measure = measure, resize = resize, ... }
end
```
