import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # If no lombok, return
    if 'lombok' not in content and '@RequiredArgsConstructor' not in content and '@Getter' not in content:
        return

    # Remove lombok imports
    content = re.sub(r'import lombok\..*?;\n', '', content)

    # find class name
    class_match = re.search(r'(?:public )?class (\w+)', content)
    if not class_match: return
    class_name = class_match.group(1)

    # RequiredArgsConstructor logic
    if '@RequiredArgsConstructor' in content:
        content = content.replace('@RequiredArgsConstructor\n', '').replace('@RequiredArgsConstructor', '')
        # find private final fields
        fields = re.findall(r'private final ([\w<>]+) (\w+);', content)
        if fields:
            params = ', '.join([f"{t} {n}" for t, n in fields])
            assigns = '\n        '.join([f"this.{n} = {n};" for t, n in fields])
            constructor = f"\n    public {class_name}({params}) {{\n        {assigns}\n    }}\n"
            # insert before the last brace
            content = content[:content.rfind('}')] + constructor + "}\n"

    # Entities logic (@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder)
    is_entity = '@Entity' in content
    if '@Getter' in content:
        content = re.sub(r'@Getter\n|@Setter\n|@NoArgsConstructor\n|@AllArgsConstructor\n|@Builder\n|@Data\n', '', content)
        content = re.sub(r'(@Getter|@Setter|@NoArgsConstructor|@AllArgsConstructor|@Builder|@Data)', '', content)
        
        # find all fields
        all_fields = re.findall(r'private ([\w<>]+) (\w+);', content)
        
        # generate getters and setters
        methods = ""
        for t, n in all_fields:
            cap_n = n[0].upper() + n[1:]
            methods += f"\n    public {t} get{cap_n}() {{ return {n}; }}\n"
            methods += f"    public void set{cap_n}({t} {n}) {{ this.{n} = {n}; }}\n"
        
        # Empty constructor
        methods += f"\n    public {class_name}() {{}}\n"
        
        params = ', '.join([f"{t} {n}" for t, n in all_fields])
        assigns = '\n        '.join([f"this.{n} = {n};" for t, n in all_fields])
        # All args constructor
        methods += f"\n    public {class_name}({params}) {{\n        {assigns}\n    }}\n"
        
        content = content[:content.rfind('}')] + methods + "}\n"

    # @Data for ErrorResponse and AssistantQuery
    if '@Data' in content and not is_entity:
        content = content.replace('@Data\n', '').replace('@Data', '')
        # find all fields
        all_fields = re.findall(r'private (?:final )?([\w<>]+) (\w+);', content)
        methods = ""
        for t, n in all_fields:
            cap_n = n[0].upper() + n[1:]
            methods += f"\n    public {t} get{cap_n}() {{ return {n}; }}\n"
            if "final" not in content:
                methods += f"    public void set{cap_n}({t} {n}) {{ this.{n} = {n}; }}\n"
        
        # Required args constructor
        params = ', '.join([f"{t} {n}" for t, n in all_fields])
        assigns = '\n        '.join([f"this.{n} = {n};" for t, n in all_fields])
        methods += f"\n    public {class_name}({params}) {{\n        {assigns}\n    }}\n"
        content = content[:content.rfind('}')] + methods + "}\n"

    # @Slf4j
    if '@Slf4j' in content:
        content = content.replace('@Slf4j\n', '').replace('@Slf4j', '')
        content = content.replace('log.error', 'System.err.println')
        content = content.replace('{', '').replace('}', '') # rough replace for simple logs

    # Write back
    with open(filepath, 'w') as f:
        f.write(content)

for root, _, files in os.walk('backend/src/main/java'):
    for file in files:
        if file.endswith('.java'):
            process_file(os.path.join(root, file))
