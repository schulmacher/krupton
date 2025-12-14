-- Simple filter that leaves lists alone and only styles other elements

function Para(elem)
  -- Check if this is a special paragraph (table para, code para, or spacer)
  if elem.attr and elem.attr.classes then
    for _, class in ipairs(elem.attr.classes) do
      if class == "table-para" or class == "table-spacer" or class == "code-para" then
        -- This is a special para, don't override it
        return elem
      end
      if class:match("^custom%-style=") then
        -- Already has a style, don't override it
        return elem
      end
    end
  end
  
  -- Check if paragraph already has a custom-style attribute (from table processing)
  if elem.attr and elem.attr.attributes and elem.attr.attributes["custom-style"] then
    -- Already has a style, don't override it
    return elem
  end
  
  -- Check if paragraph starts with ": " (Pandoc caption format)
  if elem.content[1] and elem.content[1].t == "Str" and elem.content[1].text:match("^:") then
    -- This is a caption line - remove the ": " prefix
    local first_str = elem.content[1].text
    if first_str:match("^:%s+") then
      elem.content[1].text = first_str:gsub("^:%s+", "")
    elseif first_str == ":" then
      table.remove(elem.content, 1)
      if elem.content[1] and elem.content[1].t == "Space" then
        table.remove(elem.content, 1)
      end
    end
    return pandoc.Div(elem, pandoc.Attr("", {}, {{"custom-style", "Caption"}}))
  end
  
  -- Regular paragraphs get Body Text style
  return pandoc.Div(elem, pandoc.Attr("", {}, {{"custom-style", "Body Text"}}))
end

function CodeBlock(elem)
  if elem.classes[1] == "mermaid" then
    -- Convert mermaid to PNG image
    local hash = pandoc.sha1(elem.text):sub(1, 12)
    local images_dir = "docs_thesis_ee_condensed/images"
    local mmd_file = images_dir .. "/mermaid_" .. hash .. ".mmd"
    local png_file = images_dir .. "/mermaid_" .. hash .. ".png"
    
    -- Create images directory if it doesn't exist (relative to current directory)
    os.execute("mkdir -p " .. images_dir)
    
    -- Check if PNG already exists (caching)
    local existing = io.open(png_file, "r")
    if not existing then
      -- Write mermaid code to temp file
      local f = io.open(mmd_file, "w")
      if f then
        f:write(elem.text)
        f:close()
        
        -- Call mermaid-cli to generate PNG
        -- npm install -g @mermaid-js/mermaid-cli
        -- -b transparent: transparent background
        -- -H 360: at 72 DPI (default) = 5 inches display height, fits A4 page well
        local cmd = string.format("mmdc -i '%s' -o '%s' -b transparent -H 360 2>/dev/null", mmd_file, png_file)
        local result = os.execute(cmd)
        
        -- Clean up mmd file
        os.execute("rm -f " .. mmd_file)
      end
    else
      existing:close()
    end
    
    -- Check if image was created/exists
    local img_check = io.open(png_file, "r")
    if img_check then
      img_check:close()
      -- Return image without size attributes - let Word use native size
      local img = pandoc.Image({}, "docs_thesis_ee_condensed/images/mermaid_" .. hash .. ".png", "")
      return pandoc.Para({img})
    else
      -- Fallback: keep as code block if conversion failed
      local code_lines = {}
      for line in elem.text:gmatch("[^\n]+") do
        table.insert(code_lines, pandoc.Str(line))
        table.insert(code_lines, pandoc.LineBreak())
      end
      if #code_lines > 0 then
        table.remove(code_lines)
      end
      local code_para = pandoc.Para(code_lines, pandoc.Attr("", {"code-para"}))
      return pandoc.Div(code_para, pandoc.Attr("", {}, {{"custom-style", "Program_Code"}}))
    end
  else
    -- Convert code block to styled paragraphs with marker
    local code_lines = {}
    for line in elem.text:gmatch("[^\n]+") do
      table.insert(code_lines, pandoc.Str(line))
      table.insert(code_lines, pandoc.LineBreak())
    end
    -- Remove the last line break
    if #code_lines > 0 then
      table.remove(code_lines)
    end
    local code_para = pandoc.Para(code_lines, pandoc.Attr("", {"code-para"}))
    return pandoc.Div(code_para, pandoc.Attr("", {}, {{"custom-style", "Program_Code"}}))
  end
end

function Figure(elem)
  -- Apply Caption style to figure caption
  if elem.caption and elem.caption.long then
    for i, block in ipairs(elem.caption.long) do
      elem.caption.long[i] = pandoc.Div(block, pandoc.Attr("", {}, {{"custom-style", "Caption"}}))
    end
  end
  
  -- Apply Figure style to mermaid code blocks
  if elem.content and #elem.content > 0 then
    for i, block in ipairs(elem.content) do
      if block.t == "CodeBlock" and block.classes[1] == "mermaid" then
        elem.content[i] = pandoc.Div(block, pandoc.Attr("", {}, {{"custom-style", "Figure"}}))
      end
    end
  end
  
  return elem
end

function Table(elem)
  -- Apply Caption style to table caption
  if elem.caption and elem.caption.long then
    for i, block in ipairs(elem.caption.long) do
      elem.caption.long[i] = pandoc.Div(block, pandoc.Attr("", {}, {{"custom-style", "Caption"}}))
    end
  end
  
  -- Apply Table_head style to table header cells
  for i, row in ipairs(elem.head.rows) do
    for j, cell in ipairs(row.cells) do
      for k, block in ipairs(cell.contents) do
        if block.t == "Plain" then
          block = pandoc.Para(block.content)
        end
        if block.t == "Para" then
          -- Add marker class to indicate this is a table para
          local para_with_marker = pandoc.Para(block.content, pandoc.Attr("", {"table-para"}))
          cell.contents[k] = pandoc.Div(para_with_marker, pandoc.Attr("", {}, {{"custom-style", "Tabel_head"}}))
        end
      end
    end
  end
  
  -- Apply Table_text to body cells
  for _, body in ipairs(elem.bodies) do
    for _, row in ipairs(body.body) do
      for _, cell in ipairs(row.cells) do
        for k, block in ipairs(cell.contents) do
          if block.t == "Plain" then
            block = pandoc.Para(block.content)
          end
          if block.t == "Para" then
            -- Add marker class to indicate this is a table para
            local para_with_marker = pandoc.Para(block.content, pandoc.Attr("", {"table-para"}))
            cell.contents[k] = pandoc.Div(para_with_marker, pandoc.Attr("", {}, {{"custom-style", "Table_text"}}))
          end
        end
      end
    end
  end
  
  -- Note: Table borders are added by post-processing script add_table_borders.py
  
  -- Return table wrapped with spacing paragraph after to prevent elements from touching
  local spacer = pandoc.Para({pandoc.Space()}, pandoc.Attr("", {"table-spacer"}))
  return {elem, spacer}
end

function BulletList(elem)
  local result = {}
  for _, item in ipairs(elem.content) do
    for _, block in ipairs(item) do
      if block.t == 'Para' or block.t == 'Plain' then
        table.insert(result, pandoc.Div(
          pandoc.Para(block.content),
          pandoc.Attr("", {}, {{"custom-style", "List_Bullet"}})
        ))
      else
        table.insert(result, block)
      end
    end
  end
  return result
end

function OrderedList(elem)
  local result = {}
  for i, item in ipairs(elem.content) do
    for _, block in ipairs(item) do
      if block.t == 'Para' or block.t == 'Plain' then
        table.insert(result, pandoc.Div(
          pandoc.Para(block.content),
          pandoc.Attr("", {}, {{"custom-style", "List_Numbered"}})
        ))
      else
        table.insert(result, block)
      end
    end
  end
  return result
end


