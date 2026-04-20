import { Box, Text, HStack, VStack, Flex, Badge, Button, Input, InputGroup, Combobox, createListCollection, Portal } from '@chakra-ui/react';
import { Play, Plus, Edit, Trash2, ScrollText, Lock, AlertCircle, CheckCircle, XCircle, Search, ChevronDown, ArrowUpAZ, ArrowDownZA } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { useDependantState } from '../hooks/useDependantState';
import { PageHeader } from '../components/PageHeader';
import { useMutation } from '../hooks/useQuery';
import { useStore } from '../store';
import { deleteRecipe, updateSettings } from '../api/services';
import { ConfirmDialog } from '../components/dialogs/ConfirmDialog';
import { RecipeEditorDialog } from '../components/recipes/RecipeEditorDialog';
import { RunRecipeDialog } from '../components/recipes/RunRecipeDialog';
import { ERecipeRunStatus, type IRecipe, type TRecipeSortField } from '@warpcore/shared';

const RECIPE_FIELD_LABELS: Record<TRecipeSortField, string> = {
	name: 'Name',
	createdAt: 'Creation date',
	updatedAt: 'Update date',
};

export function RecipesPage() {
	const recipesRecord = useStore((s) => s.recipes);
	const activeRun = useStore((s) => s.activeRun);

	const [showAddDialog, setShowAddDialog] = useState(false);
	const [editingRecipe, setEditingRecipe] = useState<IRecipe | null>(null);
	const [runningRecipe, setRunningRecipe] = useState<IRecipe | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState('');
	const settings = useStore(s => s.settings);
	const [sortField, setSortField] = useDependantState(settings.recipesSortField);
	const [sortOrder, setSortOrder] = useDependantState(settings.recipesSortOrder);

	// Save sort settings when they change
	const handleSortChange = useCallback((field: TRecipeSortField, order: 'asc' | 'desc') => {
		setSortField(field);
		setSortOrder(order);
		updateSettings({ recipesSortField: field, recipesSortOrder: order });
	}, []);

	const recipes = useMemo(() => {
		let result = Object.values(recipesRecord);
		const q = searchQuery.toLowerCase().trim();
		if (q) {
			result = result.filter(r =>
				r.name.toLowerCase().includes(q)
				|| r.description.toLowerCase().includes(q)
				|| r.source.toLowerCase().includes(q)
			);
		}
		result.sort((a, b) => {
			let comparison = 0;
			switch (sortField) {
				case 'name':
					comparison = a.name.localeCompare(b.name);
					break;
				case 'createdAt':
					comparison = a.createdAt - b.createdAt;
					break;
				case 'updatedAt':
					comparison = a.updatedAt - b.updatedAt;
					break;
			}
			return sortOrder === 'asc' ? comparison : -comparison;
		});
		return result;
	}, [recipesRecord, searchQuery, sortField, sortOrder]);

	const deleteMut = useMutation<string, null>(useCallback((id: string) => deleteRecipe(id), []));

	const handleDelete = async (id: string) => {
		await deleteMut.mutate(id);
		setDeletingId(null);
	};

	const activeRunRecipe = activeRun !== null ? recipesRecord[activeRun.recipeId] ?? null : null;
	const isAnyRunActive = activeRun !== null && activeRun.status === ERecipeRunStatus.RUNNING;

	return (
		<Box>
			<PageHeader
				title="Recipes"
				subtitle="Automated build pipelines"
				icon={<ScrollText size={20} />}
			/>

			{/* Subheader: Sort + Search */}
			<Box p="4" borderColor="rgba(255, 255, 255, 0.06)" borderBottomWidth="1px">
				<Flex justify="space-between" align="center" wrap="wrap" gap="3">
					<HStack gap="2">
								{(() => {
									const sortCollection = createListCollection({
										items: (Object.keys(RECIPE_FIELD_LABELS) as TRecipeSortField[]).map(f => ({ value: f, label: RECIPE_FIELD_LABELS[f] })),
										itemToString: (item) => item.label ?? '',
									});
									return (
										<Combobox.Root
											collection={sortCollection}
											value={[sortField]}
											onValueChange={(details) => {
												const val = details.value?.[0] as TRecipeSortField;
if (val) handleSortChange(val, sortOrder);
												}}
										>
											<Combobox.Control>
												<Combobox.Trigger asChild>
													<Button
														variant="outline"
														size="sm"
														w="170px"
														justifyContent="space-between"
														bg="rgba(255, 255, 255, 0.03)"
														borderColor="rgba(255, 255, 255, 0.08)"
														color="rgba(255, 255, 255, 0.7)"
														fontSize="13px"
														borderRadius="lg"
													>
														{RECIPE_FIELD_LABELS[sortField]}
														<ChevronDown size={14} />
													</Button>
												</Combobox.Trigger>
											</Combobox.Control>
											<Portal>
												<Combobox.Positioner>
													<Combobox.Content
														maxH="200px" overflowY="auto"
														bg="#181818" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.1)"
														borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
													>
														{sortCollection.items.map((item) => (
															<Combobox.Item
																key={item.value}
																item={item}
																px="3" py="2" borderRadius="md" cursor="pointer"
																_hover={{ bg: 'rgba(255, 255, 255, 0.06)' }}
																_highlighted={{ bg: '#181818' }}
															>
																<Text fontSize="12px" color="#e4e4e7">{item.label}</Text>
																<Combobox.ItemIndicator />
															</Combobox.Item>
														))}
													</Combobox.Content>
												</Combobox.Positioner>
											</Portal>
										</Combobox.Root>
									);
								})()}
								<Button
									size="sm"
									variant="outline"
									bg="rgba(255, 255, 255, 0.03)"
									borderColor="rgba(255, 255, 255, 0.08)"
									color="rgba(255, 255, 255, 0.5)"
									p="1" minW="auto"
									borderRadius="md"
									_hover={{ borderColor: 'rgba(255, 255, 255, 0.15)' }}
									title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
									onClick={() => handleSortChange(sortField, sortOrder === 'asc' ? 'desc' : 'asc')}
								>
									{sortOrder === 'asc' ? <ArrowUpAZ size={14} /> : <ArrowDownZA size={14} />}
								</Button>
							</HStack>
							<Box flex="1" maxW="300px">
								<InputGroup startElement={<Search size={14} color="rgba(255, 255, 255, 0.3)" />}>
									<Input
										placeholder="Search recipes..."
										size="sm"
										bg="rgba(255, 255, 255, 0.03)"
										borderColor="rgba(255, 255, 255, 0.08)"
										color="rgba(255, 255, 255, 0.7)"
										fontSize="13px"
										borderRadius="lg"
										_placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }}
										_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }}
										value={searchQuery}
										onChange={e => setSearchQuery(e.target.value)}
									/>
								</InputGroup>
							</Box>
						</Flex>
					</Box>

					<Box p="4">
						<VStack align="stretch" gap="4">
							{/* Active run banner */}
					{isAnyRunActive && activeRunRecipe && (
						<Flex px="4" py="3" borderRadius="xl" borderWidth="1px" borderColor="rgba(251, 191, 36, 0.25)" bg="rgba(251, 191, 36, 0.05)" align="center" justify="space-between">
							<HStack gap="3">
								<Box color="#fbbf24"><Play size={14} /></Box>
								<Text fontSize="13px" color="rgba(255, 255, 255, 0.8)">Currently running: <Text as="span" fontWeight="600" color="#fbbf24">{activeRunRecipe.name}</Text></Text>
							</HStack>
							<Button size="xs" bg="rgba(251, 191, 36, 0.15)" color="#fbbf24" _hover={{ bg: 'rgba(251, 191, 36, 0.25)' }} onClick={() => setRunningRecipe(activeRunRecipe)}>
								Monitor
							</Button>
						</Flex>
					)}

					{/* Recipes section */}
					<Box borderWidth="1px" borderColor="rgba(255,255,255,0.06)" borderRadius="xl" bg="rgba(255,255,255,0.015)" overflow="hidden">
						<Flex px="4" py="3" align="center" justify="space-between">
							<HStack gap="3">
								<ScrollText size={16} color="rgba(255, 255, 255, 0.5)" />
								<Text fontSize="13px" fontWeight="600" color="rgba(255,255,255,0.8)">All Recipes</Text>
								<Badge size="sm" px="1.5" borderRadius="full" bg="rgba(255,255,255,0.06)" color="rgba(255,255,255,0.4)" fontSize="10px" fontWeight="600">{recipes.length}</Badge>
							</HStack>
							<Button size="xs" variant="ghost" color="rgba(255,255,255,0.5)" _hover={{ bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }} onClick={() => setShowAddDialog(true)}>
								<Plus size={15} />
							</Button>
						</Flex>

						<Box px="4" pb="3">
							{recipes.length === 0 ? (
								<Flex h="200px" alignItems="center" justifyContent="center">
									<VStack gap="3" color="rgba(255, 255, 255, 0.2)">
										<ScrollText size={40} />
										<Text fontSize="14px">No recipes yet</Text>
										<Button size="xs" bg="rgba(51, 129, 255, 0.15)" color="#60a5fa" _hover={{ bg: 'rgba(51, 129, 255, 0.25)' }} onClick={() => setShowAddDialog(true)}>
											<Plus size={13} />
											<Text ml="1.5">Create your first recipe</Text>
										</Button>
									</VStack>
								</Flex>
							) : (
								<VStack align="stretch" gap="2.5">
									{recipes.map(recipe => (
										<RecipeRow
											key={recipe.id}
											recipe={recipe}
											onRun={() => setRunningRecipe(recipe)}
											onEdit={() => setEditingRecipe(recipe)}
											onDelete={() => setDeletingId(recipe.id)}
										/>
									))}
								</VStack>
							)}
						</Box>
					</Box>
				</VStack>
			</Box>

			{showAddDialog && <RecipeEditorDialog onClose={() => setShowAddDialog(false)} />}
			{editingRecipe && <RecipeEditorDialog editData={editingRecipe} onClose={() => setEditingRecipe(null)} />}
			{runningRecipe && <RunRecipeDialog recipe={runningRecipe} onClose={() => setRunningRecipe(null)} />}
			{deletingId && (
				<ConfirmDialog
					title="Delete Recipe?"
					message={`This will permanently delete "${recipes.find(r => r.id === deletingId)?.name}".`}
					isOpen={true}
					isLoading={deleteMut.loading}
					onCancel={() => setDeletingId(null)}
					onConfirm={() => handleDelete(deletingId)}
				/>
			)}
		</Box>
	);
}

interface IRecipeRowProps {
	recipe: IRecipe;
	onRun: () => void;
	onEdit: () => void;
	onDelete: () => void;
}

function RecipeRow({ recipe, onRun, onEdit, onDelete }: IRecipeRowProps) {
	const activeRun = useStore((s) => s.activeRun);
	const isThisActive = activeRun !== null && activeRun.recipeId === recipe.id;
	const isOtherActive = activeRun !== null && activeRun.recipeId !== recipe.id && activeRun.status === ERecipeRunStatus.RUNNING;

	return (
		<Box px="3" py="2" borderRadius="lg" bg="rgba(255, 255, 255, 0.02)" borderWidth="1px" borderColor={isThisActive ? 'rgba(251, 191, 36, 0.3)' : 'rgba(255, 255, 255, 0.06)'} _hover={{ borderColor: isThisActive ? 'rgba(251, 191, 36, 0.5)' : 'rgba(255, 255, 255, 0.1)' }}>
			<Flex justify="space-between" align="center">
				<HStack gap="3" flex="1">
					<Flex w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center" bg="rgba(255, 255, 255, 0.04)">
						<ScrollText size={20} color="rgba(255, 255, 255, 0.5)" />
					</Flex>
					<Box flex="1">
						<HStack gap="2" align="center">
							<Text fontSize="15px" fontWeight="600" color="#e4e4e7">{recipe.name}</Text>
							{recipe.isBuiltIn && (
								<Badge size="sm" px="1.5" py="0.5" borderRadius="full" bg="rgba(167, 139, 250, 0.15)" color="#a78bfa" fontSize="10px" fontWeight="600">
									<HStack gap="1"><Lock size={9} /><Text>Built-in</Text></HStack>
								</Badge>
							)}
							{isThisActive && (
								<Badge size="sm" px="1.5" py="0.5" borderRadius="full" bg="rgba(251, 191, 36, 0.15)" color="#fbbf24" fontSize="10px" fontWeight="600">Running</Badge>
							)}
						</HStack>
						{recipe.description && (
							<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)" lineClamp={1}>{recipe.description}</Text>
						)}
					</Box>
				</HStack>
				<HStack gap="2">
					<Button size="xs" bg="rgba(52, 211, 153, 0.1)" color="#34d399" _hover={{ bg: 'rgba(52, 211, 153, 0.2)' }} borderRadius="md" onClick={onRun} disabled={isOtherActive}>
						<Play size={13} />
						<Text ml="1">{isThisActive ? 'View' : 'Run'}</Text>
					</Button>
					<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }} borderRadius="md" onClick={onEdit} disabled={recipe.isBuiltIn}>
						<Edit size={14} />
					</Button>
					<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }} borderRadius="md" onClick={onDelete} disabled={recipe.isBuiltIn}>
						<Trash2 size={14} />
					</Button>
				</HStack>
			</Flex>
		</Box>
	);
}
